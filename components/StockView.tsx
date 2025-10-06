import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import * as fmpService from '../services/fmpService';
import * as geminiService from '../services/geminiService';
import type { FmpQuote, FmpProfile, FmpHistoricalData, FmpNews, AiAnalysis, FmpAnalystRating, FmpIncomeStatement, FmpBalanceSheet, FmpCashFlowStatement, FmpInsiderTrading, FinancialStatementAnalysis, TechnicalAnalysis, CombinedRec, AlpacaOptionContract, OptionHolding, KeyMetricsAnalysis } from '../types';
import { usePortfolio } from '../hooks/usePortfolio';
import { useWatchlist } from '../hooks/useWatchlist';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters';
import { BrainCircuitIcon, StarIcon, HelpCircleIcon } from './common/Icons';
import CandlestickChart from './CandlestickChart';
import * as optionsProxyService from '../services/optionsProxyService';
import ChatPanel from './ChatPanel';
import Watchlist from './Watchlist';
import { useAuth } from '../src/hooks/useAuth.tsx';

const usePersistentState = <T,>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
    const [state, setState] = useState<T>(() => {
        try {
            const storedValue = localStorage.getItem(key);
            return storedValue ? JSON.parse(storedValue) : defaultValue;
        } catch (error) {
            console.error(`Error reading localStorage key “${key}”:`, error);
            return defaultValue;
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (error) {
            console.error(`Error setting localStorage key “${key}”:`, error);
        }
    }, [key, state]);

    return [state, setState];
};

const HelpIconWithTooltip: React.FC<{ tooltip: string }> = ({ tooltip }) => (
    <div className="relative flex items-center group">
        <HelpCircleIcon className="h-4 w-4 text-night-500" />
        <div className="absolute top-full mt-2 bg-night-600 text-white text-xs rounded-md p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20">
            {tooltip}
        </div>
    </div>
);

const StockView: React.FC = () => {
    const { ticker } = useParams<{ ticker: string }>();
    const { buyStock, sellStock, portfolio, buyOption, sellOption } = usePortfolio();
    const { addToWatchlist, removeFromWatchlist, isOnWatchlist } = useWatchlist();
    const { user } = useAuth();

    const formatGreek = useCallback((value: number | null): string => {
        if (value === null) return 'N/A';
        return value.toFixed(3);
    }, []);

    const [quote, setQuote] = useState<FmpQuote | null>(null);
    const [profile, setProfile] = useState<FmpProfile | null>(null);
    const [historicalData, setHistoricalData] = useState<FmpHistoricalData[]>([]);
    const [chartInterval, setChartInterval] = usePersistentState<string>(`chartInterval-${ticker}`, '1day');
    const [news, setNews] = useState<FmpNews[]>([]);
    const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
    const [analystRatings, setAnalystRatings] = useState<FmpAnalystRating[]>([]);
    const [incomeStatement, setIncomeStatement] = useState<FmpIncomeStatement | null>(null);
    const [balanceSheet, setBalanceSheet] = useState<FmpBalanceSheet | null>(null);
    const [cashFlowStatement, setCashFlowStatement] = useState<FmpCashFlowStatement | null>(null);
    const [insiderTrades, setInsiderTrades] = useState<FmpInsiderTrading[]>([]);
    const [financialStatementAnalysis, setFinancialStatementAnalysis] = useState<FinancialStatementAnalysis | null>(null);
    const [technicalAnalysis, setTechnicalAnalysis] = useState<TechnicalAnalysis | null>(null);
    const [combinedRec, setCombinedRec] = usePersistentState<CombinedRec | null>(`combinedRec-${ticker}`, null);
    const [keyMetricsAnalysis, setKeyMetricsAnalysis] = useState<KeyMetricsAnalysis | null>(null);
    
    // START NEW OPTIONS STATE & LOGIC
    const [options, setOptions] = useState<AlpacaOptionContract[]>([]);
    const [selectedOption, setSelectedOption] = useState<AlpacaOptionContract | null>(null);
    const [availableExpirationDates, setAvailableExpirationDates] = useState<string[]>([]);
    const [selectedExpiry, setSelectedExpiry] = useState<string>('');
    // END NEW OPTIONS STATE & LOGIC

    const [isLoading, setIsLoading] = useState(true);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isKeyMetricsLoading, setIsKeyMetricsLoading] = useState(false);
    const [tradeShares, setTradeShares] = usePersistentState<number | ''>(`tradeShares-${ticker}`, 1);
    const [activeTab, setActiveTab] = useState('summary');
    const [tradeTab, setTradeTab] = usePersistentState<'stock' | 'calls' | 'puts'>(`tradeTab-${ticker}`, 'stock');
    
    const [hasRunFinancialAnalysis, setHasRunFinancialAnalysis] = useState(false);
    const [hasRunTechnicalAnalysis, setHasRunTechnicalAnalysis] = useState(false);
    const [hasRunAdvancedRecs, setHasRunAdvancedRecs] = useState(false);

    // 1. Memoize availableExpirationDates for the dropdown
    const expirationDates = useMemo(() => {
        // Return sorted list of available dates from the API response
        return availableExpirationDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    }, [availableExpirationDates]);

    // 2. Effect to set the default selected expiry
    useEffect(() => {
        if (expirationDates.length > 0 && selectedExpiry === '') {
            setSelectedExpiry(expirationDates[0]);
        } else if (selectedExpiry !== '' && !expirationDates.includes(selectedExpiry)) {
            // Reset if the previously selected expiry is no longer available (e.g., switched ticker)
            setSelectedExpiry(expirationDates[0]);
        }
    }, [expirationDates, selectedExpiry]);
    
    // 3. Filter options by type AND selected expiration date
    const filteredOptions = useMemo(() => {
        return options.filter(o => 
            o.type === (tradeTab === 'calls' ? 'call' : 'put') && 
            o.expiration_date === selectedExpiry
        );
    }, [options, tradeTab, selectedExpiry]);


    useEffect(() => {
        if (!ticker) return;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // The new implementation of getOptionsChain returns an object { contracts, availableExpirationDates }
                const [quoteData, profileData, historyData, newsData, ratingsData, incomeData, balanceSheetData, cashFlowData, insiderTradingData, optionsResult] = await Promise.all([
                    fmpService.getQuote(ticker),
                    fmpService.getProfile(ticker),
                    fmpService.getHistoricalData(ticker, chartInterval),
                    fmpService.getNews(ticker, 10),
                    fmpService.getAnalystRatings(ticker),
                    fmpService.getIncomeStatement(ticker),
                    fmpService.getBalanceSheet(ticker),
                    fmpService.getCashFlowStatement(ticker),
                    fmpService.getInsiderTrading(ticker),
                    optionsProxyService.getOptionsChain(ticker),
                ]);
                
                setQuote(quoteData[0] || null);
                setProfile(profileData[0] || null);
                const historical = historyData.historical ? historyData.historical.reverse() : (historyData as any);
                setHistoricalData(historical);
                setNews(newsData);
                setAnalystRatings(ratingsData);
                setIncomeStatement(incomeData[0] || null);
                setBalanceSheet(balanceSheetData[0] || null);
                setCashFlowStatement(cashFlowData[0] || null);
                setInsiderTrades(insiderTradingData);
                
                // Update both contracts and the new expiration dates state
                setOptions(optionsResult.contracts); 
                setAvailableExpirationDates(optionsResult.availableExpirationDates); 
            } catch (error) {
                console.error("Failed to fetch stock data:", error);
                alert('Failed to load stock data. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [ticker, chartInterval]);

    const handleKeyMetricsAnalysis = useCallback(async () => {
        if (!quote || !profile) return;
        setIsKeyMetricsLoading(true);
        setKeyMetricsAnalysis(null);
        try {
            const analysis = await geminiService.analyzeKeyMetrics(quote, profile);
            setKeyMetricsAnalysis(analysis);
        } catch (error) {
            console.error("AI Key Metrics Analysis failed:", error);
            alert("The AI key metrics analysis could not be completed.");
        } finally {
            setIsKeyMetricsLoading(false);
        }
    }, [quote, profile]);

    const handleAiAnalysis = useCallback(async () => {
        if (!profile || news.length === 0) return;
        setIsAiLoading(true);
        setAiAnalysis(null);
        try {
            const analysis = await geminiService.analyzeNewsSentiment(profile.companyName, news);
            setAiAnalysis(analysis);
        } catch (error) {
            console.error("AI Analysis failed:", error);
            alert("The AI analysis could not be completed.");
        } finally {
            setIsAiLoading(false);
        }
    }, [profile, news]);

    const handleFinancialAnalysis = useCallback(async () => {
        if (!incomeStatement || !balanceSheet || !cashFlowStatement) return;
        setIsAiLoading(true);
        setHasRunFinancialAnalysis(true);
        setFinancialStatementAnalysis(null);
        try {
            const analysis = await geminiService.analyzeFinancialStatements(incomeStatement, balanceSheet, cashFlowStatement);
            setFinancialStatementAnalysis(analysis);
        } catch (error) {
            console.error("AI Financial Analysis failed:", error);
            alert("The AI financial analysis could not be completed.");
        } finally {
            setIsAiLoading(false);
        }
    }, [incomeStatement, balanceSheet, cashFlowStatement]);

    const handleTechnicalAnalysis = useCallback(async () => {
        if (historicalData.length === 0) return;
        setIsAiLoading(true);
        setHasRunTechnicalAnalysis(true);
        setTechnicalAnalysis(null);
        try {
            const analysis = await geminiService.getTechnicalAnalysis(historicalData);
            setTechnicalAnalysis(analysis);
        } catch (error) {
            console.error("AI Technical Analysis failed:", error);
            alert("The AI technical analysis could not be completed.");
        } finally {
            setIsAiLoading(false);
        }
    }, [historicalData]);

    const handleAdvancedRecommendations = useCallback(async () => {
        if (!profile || historicalData.length === 0 || analystRatings.length === 0) {
            alert("Not enough data to generate a recommendation. Please ensure all data has loaded.");
            return;
        }
        setIsAiLoading(true);
        setHasRunAdvancedRecs(true);
        setCombinedRec(null); // Clear previous recommendation before fetching new one
        try {
            const technicals = await geminiService.getTechnicalAnalysis(historicalData);
            setTechnicalAnalysis(technicals);
            const recommendation = await geminiService.getCombinedRecommendations(profile, analystRatings, technicals);
            setCombinedRec(recommendation);

        } catch (error) {
            console.error("AI Advanced Recommendations failed:", error);
            alert("The AI advanced recommendations could not be completed.");
        } finally {
            setIsAiLoading(false);
        }
    }, [profile, historicalData, analystRatings, setCombinedRec]);

    const handleTradeTabChange = (tab: 'stock' | 'calls' | 'puts') => {
        setTradeTab(tab);
        setSelectedOption(null); // Clear selected option when switching tabs
    };

    const handleSharesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '') {
            setTradeShares('');
        } else {
            const numValue = parseInt(value, 10);
            setTradeShares(Math.max(1, numValue) || 1);
        }
    };
    
    const handleBuy = () => {
        const shares = Number(tradeShares);
        if (shares <= 0) return;

        if (tradeTab === 'stock' && quote && profile) {
            buyStock(quote.symbol, profile.companyName, shares, quote.price);
            alert(`Successfully bought ${shares} share(s) of ${quote.symbol}`);
        } else if (selectedOption) {
            const optionToBuy: OptionHolding = {
                symbol: selectedOption.symbol,
                underlyingTicker: selectedOption.underlying_symbol,
                shares: shares,
                purchasePrice: selectedOption.close_price || 0,
                currentPrice: selectedOption.close_price || 0,
                optionType: selectedOption.type,
                strikePrice: parseFloat(selectedOption.strike_price),
                expirationDate: selectedOption.expiration_date,
                delta: selectedOption.delta,
                gamma: selectedOption.gamma,
                theta: selectedOption.theta,
                vega: selectedOption.vega,
                impliedVolatility: selectedOption.impliedVolatility,
                open_interest: selectedOption.open_interest,
                volume: selectedOption.volume
            };
            buyOption(optionToBuy);
            alert(`Successfully bought ${shares} contract(s) of ${selectedOption.symbol}`);
        }
    };
    
    const handleSell = () => {
        const shares = Number(tradeShares);
        if (shares <= 0) return;

        if (tradeTab === 'stock' && quote) {
            sellStock(quote.symbol, shares, quote.price);
            alert(`Successfully sold ${shares} share(s) of ${quote.symbol}`);
        } else if (selectedOption) {
            sellOption(selectedOption.symbol, shares, selectedOption.close_price || 0);
             alert(`Successfully sold ${shares} contract(s) of ${selectedOption.symbol}`);
        }
    };

    const handleWatchlistToggle = () => {
        if (!ticker || !profile) return;
        if (isOnWatchlist(ticker)) {
            removeFromWatchlist(ticker);
        } else {
            addToWatchlist(ticker, profile.companyName);
        }
    };

    const sharesOwned = portfolio.holdings.find(h => h.ticker === ticker)?.shares || 0;
    const contractsOwned = portfolio.optionHoldings.find(o => o.symbol === selectedOption?.symbol)?.shares || 0;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
    }

    if (!quote || !profile) {
        return <div className="text-center text-red-500 mt-10">Stock data not found for {ticker}.</div>;
    }

    const priceChangeColor = quote.change >= 0 ? 'text-brand-green' : 'text-brand-red';
    const onWatchlist = ticker ? isOnWatchlist(ticker) : false;

    const renderTabContent = () => {
        // This is the new, reusable section for the AI recommendation
        const smartRecSection = (
            <div className="bg-night-700 p-4 rounded-lg mt-6 border-l-4 border-brand-blue">
                <h3 className="text-lg font-bold flex items-center gap-2"><BrainCircuitIcon className="h-5 w-5 text-brand-blue" /> AI Smart Recommendation</h3>
                {(isAiLoading && hasRunAdvancedRecs) ? (
                     <div className="mt-2"><Spinner /></div>
                ) : combinedRec ? (
                    <div>
                        <p className="mt-2">
                            <span className="font-bold">Sentiment:</span> <span className={combinedRec.sentiment === 'BULLISH' ? 'text-brand-green' : combinedRec.sentiment === 'BEARISH' ? 'text-brand-red' : ''}>{combinedRec.sentiment}</span>
                            <span className="font-bold ml-4">Action:</span> <span className="text-yellow-400">{combinedRec.strategy}</span>
                        </p>
                        <p className="text-xs text-night-100 mt-1">{combinedRec.justification}</p>
                    </div>
                ) : (
                    <div className="mt-2 text-center">
                        <p className="text-sm text-night-100 mb-3">Synthesize fundamental, technical, and analyst data into a single actionable strategy.</p>
                        <button onClick={handleAdvancedRecommendations} disabled={isAiLoading} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600 text-sm">
                            {isAiLoading ? 'Analyzing...' : 'Generate Strategy'}
                        </button>
                    </div>
                )}
            </div>
        );

        switch (activeTab) {
            case 'summary':
                return (
                    <Card>
                         <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Key Statistics</h2>
                            <button onClick={handleKeyMetricsAnalysis} disabled={isKeyMetricsLoading} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600">
                                {isKeyMetricsLoading ? 'Analyzing...' : 'Analyze'}
                            </button>
                        </div>
                         <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                            <div><span className="text-night-500">Market Cap:</span> {formatNumber(quote.marketCap)}</div>
                            <div><span className="text-night-500">Volume:</span> {formatNumber(quote.volume)}</div>
                            <div><span className="text-night-500">Avg Volume:</span> {formatNumber(quote.avgVolume)}</div>
                            <div><span className="text-night-500">Day High:</span> {formatCurrency(quote.dayHigh)}</div>
                            <div><span className="text-night-500">Day Low:</span> {formatCurrency(quote.dayLow)}</div>
                            <div><span className="text-night-500">52-Wk High:</span> {formatCurrency(quote.yearHigh)}</div>
                            <div><span className="text-night-500">52-Wk Low:</span> {formatCurrency(quote.yearLow)}</div>
                            <div><span className="text-night-500">P/E Ratio:</span> {quote.pe ? quote.pe.toFixed(2) : 'N/A'}</div>
                            <div><span className="text-night-500">EPS:</span> {quote.eps ? formatCurrency(quote.eps) : 'N/A'}</div>
                        </div>
                        {isKeyMetricsLoading && <div className="mt-4"><Spinner /></div>}
                        {keyMetricsAnalysis && (
                            <div className="mt-6 border-t border-night-700 pt-4">
                                <p className="text-night-100">{keyMetricsAnalysis.summary}</p>
                            </div>
                        )}
                        {smartRecSection}
                    </Card>
                );
            case 'news':
                return (
                    <Card>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Latest News</h2>
                            <button onClick={handleAiAnalysis} disabled={isAiLoading} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600">
                                {isAiLoading ? 'Analyzing...' : 'Run AI Sentiment Analysis'}
                            </button>
                        </div>
                        {isAiLoading && <Spinner />}
                        {aiAnalysis && (
                            <div className="bg-night-700 p-4 rounded-lg mb-6">
                                <h3 className="text-lg font-bold">AI Sentiment: <span className="text-brand-blue">{aiAnalysis.sentiment}</span> (Confidence: {formatPercentage(aiAnalysis.confidenceScore * 100)})</h3>
                                <p className="mt-2 text-night-100">{aiAnalysis.summary}</p>
                            </div>
                        )}
                        <div className="space-y-4">
                            {news.length > 0 ? news.map((article, index) => (
                                <a href={article.url} key={index} target="_blank" rel="noopener noreferrer" className="block bg-night-700 p-4 rounded-lg hover:bg-night-600 transition-colors">
                                    <div className="flex items-start gap-4">
                                        {article.image && <img src={article.image} alt={article.title} className="w-24 h-24 object-cover rounded-md"/>}
                                        <div>
                                            <h3 className="font-bold text-lg">{article.title}</h3>
                                            <p className="text-sm text-night-500 mt-1">{new Date(article.publishedDate).toLocaleString()}</p>
                                            <p className="text-sm text-night-100 mt-2 line-clamp-2">{article.text}</p>
                                        </div>
                                    </div>
                                </a>
                            )) : (
                                <p className="text-center text-night-500">No news available for this stock.</p>
                            )}
                        </div>
                        {smartRecSection}
                    </Card>
                );
            case 'financials':
                 return (
                    <Card>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold flex items-center gap-2"><BrainCircuitIcon className="h-6 w-6 text-brand-blue" /> AI Financial Summary</h2>
                            <button onClick={handleFinancialAnalysis} disabled={isAiLoading} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600">
                                {isAiLoading ? 'Analyzing...' : 'Run Analysis'}
                            </button>
                        </div>
                        {(!isAiLoading && !hasRunFinancialAnalysis) && (
                            <p className="text-night-500 mb-4">
                                Use our AI to analyze the company's income statement, balance sheet, and cash flow statement. 
                                The model will identify key financial strengths and weaknesses to give you a quick overview of the company's health.
                            </p>
                        )}
                        {isAiLoading && <Spinner />}
                        {financialStatementAnalysis && (
                            <div className="bg-night-700 p-4 rounded-lg">
                                <h3 className="text-lg font-bold">Strengths</h3>
                                <ul className="list-disc list-inside text-brand-green">
                                    {financialStatementAnalysis.strengths.map((item, index) => <li key={index}>{item}</li>)}
                                </ul>
                                <h3 className="text-lg font-bold mt-4">Weaknesses</h3>
                                <ul className="list-disc list-inside text-brand-red">
                                    {financialStatementAnalysis.weaknesses.map((item, index) => <li key={index}>{item}</li>)}
                                </ul>
                                <p className="mt-4 text-night-100">{financialStatementAnalysis.summary}</p>
                            </div>
                        )}
                        {smartRecSection}
                    </Card>
                );
            case 'ratings':
                 return (
                    <Card>
                        <h2 className="text-xl font-bold mb-4">Analyst Ratings</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b border-night-600">
                                    <tr>
                                        <th className="p-3">Date</th>
                                        <th className="p-3 text-brand-green">Buy</th>
                                        <th className="p-3">Hold</th>
                                        <th className="p-3 text-brand-red">Sell</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analystRatings.length > 0 ? analystRatings.map((rating, index) => {
                                        const totalBuy = (rating.analystRatingsBuy || 0) + (rating.analystRatingsStrongBuy || 0);
                                        const totalSell = (rating.analystRatingsSell || 0) + (rating.analystRatingsStrongSell || 0);
                                        return (
                                            <tr key={index} className="border-b border-night-700 hover:bg-night-700">
                                                <td className="p-3">{rating.date}</td>
                                                <td className="p-3 font-bold text-brand-green">{totalBuy}</td>
                                                <td className="p-3 font-bold">{rating.analystRatingsHold || 0}</td>
                                                <td className="p-3 font-bold text-brand-red">{totalSell}</td>
                                            </tr>
                                        )
                                    }) : (
                                        <tr>
                                            <td colSpan={4} className="text-center p-6 text-night-500">No analyst ratings available for this stock.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                );
            case 'insider':
                return (
                    <Card>
                        <h2 className="text-xl font-bold mb-4">Insider Trades</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b border-night-600">
                                    <tr>
                                        <th className="p-3">Date</th>
                                        <th className="p-3">Insider Name</th>
                                        <th className="p-3">Type</th>
                                        <th className="p-3">Shares</th>
                                        <th className="p-3">Price</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {insiderTrades.length > 0 ? insiderTrades.map((trade, index) => (
                                        <tr key={index} className="border-b border-night-700 hover:bg-night-700">
                                            <td className="p-3">{trade.transactionDate}</td>
                                            <td className="p-3">{trade.reportingName}</td>
                                            <td className={`p-3 font-semibold ${trade.transactionType === 'P-Purchase' ? 'text-brand-green' : 'text-brand-red'}`}>{trade.transactionType}</td>
                                            <td className="p-3">{formatNumber(trade.securitiesTransacted)}</td>
                                            <td className="p-3">{formatCurrency(trade.price)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={5} className="text-center p-6 text-night-500">No insider trades reported for this stock.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                );
            case 'technical':
                return (
                    <Card>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold flex items-center gap-2"><BrainCircuitIcon className="h-6 w-6 text-brand-blue" /> AI Technical Analysis</h2>
                            <button onClick={handleTechnicalAnalysis} disabled={isAiLoading} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600">
                                {isAiLoading ? 'Analyzing...' : 'Run Analysis'}
                            </button>
                        </div>
                        {(!isAiLoading && !hasRunTechnicalAnalysis) && (
                            <p className="text-night-500 mb-4">
                                Let the AI analyze the historical price chart to identify the current trend, key support and resistance levels, and provide a summary of the technical outlook.
                            </p>
                        )}
                        {isAiLoading && <Spinner />}
                        {technicalAnalysis && (
                            <div className="bg-night-700 p-4 rounded-lg">
                                <h3 className="text-lg font-bold">Trend: <span className="text-brand-blue">{technicalAnalysis.trend}</span></h3>
                                <p className="text-night-100 mt-2">Support: <span className="font-bold">{formatCurrency(technicalAnalysis.support)}</span></p>
                                <p className="text-night-100">Resistance: <span className="font-bold">{formatCurrency(technicalAnalysis.resistance)}</span></p>
                                <p className="mt-4 text-night-100">{technicalAnalysis.summary}</p>
                            </div>
                        )}
                        {smartRecSection}
                    </Card>
                );
            case 'advanced':
                return (
                     <Card>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold flex items-center gap-2"><BrainCircuitIcon className="h-6 w-6 text-brand-blue" /> AI Synthesized Strategy</h2>
                            {/* This button is now redundant but kept for the dedicated tab */}
                        </div>
                         {smartRecSection}
                    </Card>
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {user && <ChatPanel />} {/* MODIFIED: Only show SignatexFlow if logged in */}
            <Link to="/" className="text-brand-blue hover:underline">&larr; Back to Dashboard</Link>
            
            <Card>
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-4">
                        <img src={profile.image} alt={profile.companyName} className="h-16 w-16 rounded-full"/>
                        <div>
                            <h1 className="text-3xl font-bold">{profile.companyName} ({profile.symbol})</h1>
                            <p className="text-night-500">{quote.exchange}</p>
                        </div>
                    </div>
                    {user && 
                        <button 
                            onClick={handleWatchlistToggle} 
                            className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors text-sm font-bold ${
                                onWatchlist 
                                    ? 'bg-yellow-500 text-night-900 hover:bg-yellow-600' 
                                    : 'bg-night-700 hover:bg-night-600'
                            }`}
                        >
                            <StarIcon className={`h-5 w-5 ${onWatchlist ? 'text-night-900' : 'text-yellow-400'}`} />
                            {onWatchlist ? 'On Watchlist' : 'Add to Watchlist'}
                        </button>
                    }
                </div>
                <div className="mt-4 flex items-baseline gap-4">
                    <span className="text-5xl font-bold">{formatCurrency(quote.price)}</span>
                    <span className={`text-2xl font-semibold ${priceChangeColor}`}>
                        {quote.change >= 0 ? '+' : ''}{formatCurrency(quote.change)} ({formatPercentage(quote.changesPercentage)})
                    </span>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                    {user && <Watchlist />} {/* MODIFIED: Only show Watchlist if logged in */}
                    {/* MODIFIED: Conditionally render Trade Card */}
                    {user ? (
                        <Card>
                            <h2 className="text-xl font-bold mb-4">Trade</h2>
                            <div className="border-b border-night-700 mb-4">
                                <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                                    <button onClick={() => handleTradeTabChange('stock')} className={`whitespace-nowrap pb-2 px-1 border-b-2 font-medium text-sm ${tradeTab === 'stock' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Stock</button>
                                    <button onClick={() => handleTradeTabChange('calls')} className={`flex items-center gap-1 whitespace-nowrap pb-2 px-1 border-b-2 font-medium text-sm ${tradeTab === 'calls' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>
                                        Calls <HelpIconWithTooltip tooltip="Call options give the holder the right, but not the obligation, to buy a stock at a specified price before a certain date." />
                                    </button>
                                    <button onClick={() => handleTradeTabChange('puts')} className={`flex items-center gap-1 whitespace-nowrap pb-2 px-1 border-b-2 font-medium text-sm ${tradeTab === 'puts' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>
                                        Puts <HelpIconWithTooltip tooltip="Put options give the holder the right, but not the obligation, to sell a stock at a specified price before a certain date." />
                                    </button>
                                </nav>
                            </div>
                            <div className="space-y-4">
                                {tradeTab === 'stock' && (
                                    <>
                                        <div className="text-sm">Shares Owned: <span className="font-bold">{sharesOwned}</span></div>
                                        <div className="text-sm">Cash Available: <span className="font-bold">{formatCurrency(portfolio.cash)}</span></div>
                                    </>
                                )}
                                
                                {/* ADDITION: Expiration Date Selector for Options */}
                                {(tradeTab === 'calls' || tradeTab === 'puts') && (
                                    <div>
                                        <label htmlFor="expiry-select" className="block text-sm font-medium text-night-100 mb-1">Expiration Date</label>
                                        <select
                                            id="expiry-select"
                                            value={selectedExpiry}
                                            onChange={(e) => {
                                                setSelectedExpiry(e.target.value);
                                                setSelectedOption(null); // Clear selected option on date change
                                            }}
                                            className="w-full bg-night-700 border border-night-600 rounded-md py-2 px-3 focus:ring-2 focus:ring-brand-blue focus:outline-none"
                                            disabled={expirationDates.length === 0}
                                        >
                                            {expirationDates.length === 0 ? (
                                                <option>Loading...</option>
                                            ) : (
                                                expirationDates.map(date => (
                                                    <option key={date} value={date}>{date}</option>
                                                ))
                                            )}
                                        </select>
                                    </div>
                                )}

                                {(tradeTab === 'calls' || tradeTab === 'puts') && (
                                    <div className="h-48 overflow-auto bg-night-700 p-2 rounded-md">
                                        <table className="text-left text-xs">
                                            <thead>
                                                <tr>
                                                    <th className="p-2 whitespace-nowrap">Strike</th>
                                                    <th className="p-2 whitespace-nowrap">Expiry</th>
                                                    <th className="p-2 whitespace-nowrap">Price</th>
                                                    <th className="p-2 whitespace-nowrap">
                                                        <div className="flex items-center gap-1">
                                                            IV <HelpIconWithTooltip tooltip="Implied Volatility: The market's forecast of a likely movement in a security's price." />
                                                        </div>
                                                    </th>
                                                    <th className="p-2 whitespace-nowrap">OI/Vol</th>
                                                    <th className="p-2 whitespace-nowrap">
                                                        <div className="flex items-center gap-1">
                                                            Δ <HelpIconWithTooltip tooltip="Delta: Rate of change of an option's price relative to a $1 change in the underlying asset's price." />
                                                        </div>
                                                    </th>
                                                    <th className="p-2 whitespace-nowrap">
                                                        <div className="flex items-center gap-1">
                                                            Γ <HelpIconWithTooltip tooltip="Gamma: Rate of change in an option's delta per $1 change in the underlying asset price." />
                                                        </div>
                                                    </th>
                                                    <th className="p-2 whitespace-nowrap">
                                                        <div className="flex items-center gap-1">
                                                            Θ <HelpIconWithTooltip tooltip="Theta: Rate of decline in the value of an option due to the passage of time." />
                                                        </div>
                                                    </th>
                                                    <th className="p-2 whitespace-nowrap">
                                                        <div className="flex items-center gap-1">
                                                            ν <HelpIconWithTooltip tooltip="Vega: Rate of change in an option's price for a 1% change in the implied volatility." />
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* MODIFICATION: Use filteredOptions */}
                                                {filteredOptions.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={10} className="text-center text-night-500 p-3">No {tradeTab} options for this date or loading data.</td>
                                                    </tr>
                                                ) : (
                                                    filteredOptions.map(option => (
                                                        <tr 
                                                            key={option.symbol} 
                                                            onClick={() => setSelectedOption(option)} 
                                                            className={`cursor-pointer hover:bg-night-600 ${selectedOption?.symbol === option.symbol ? 'bg-brand-blue' : ''}`}
                                                        >
                                                            <td className="p-2 whitespace-nowrap">{formatCurrency(parseFloat(option.strike_price))}</td>
                                                            <td className="p-2 whitespace-nowrap">{option.expiration_date.slice(5, 10)}</td>
                                                            <td className="p-2 whitespace-nowrap">{formatCurrency(option.close_price || 0)}</td>
                                                            <td className="p-2 whitespace-nowrap">{option.impliedVolatility !== null ? formatPercentage(option.impliedVolatility * 100) : 'N/A'}</td>
                                                            <td className="p-2 whitespace-nowrap text-night-500">{formatNumber(option.open_interest || 0)}/{formatNumber(option.volume || 0)}</td>
                                                            <td className="p-2 whitespace-nowrap">{formatGreek(option.delta)}</td>
                                                            <td className="p-2 whitespace-nowrap">{formatGreek(option.gamma)}</td>
                                                            <td className="p-2 whitespace-nowrap">{formatGreek(option.theta)}</td>
                                                            <td className="p-2 whitespace-nowrap">{formatGreek(option.vega)}</td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                
                                {selectedOption && (tradeTab === 'calls' || tradeTab === 'puts') && (
                                     <div className="text-sm bg-night-700 p-2 rounded-md">
                                        Selected: {selectedOption.symbol} <br/>
                                        Contracts Owned: <span className="font-bold">{contractsOwned}</span>
                                    </div>
                                )}
                                
                                <div>
                                    <label htmlFor="shares" className="block text-sm font-medium text-night-100 mb-1">{tradeTab === 'stock' ? 'Shares' : 'Contracts'}</label>
                                    <input
                                        type="number"
                                        id="shares"
                                        value={tradeShares}
                                        onChange={handleSharesChange}
                                        className="w-full bg-night-700 border border-night-600 rounded-md py-2 px-3 focus:ring-2 focus:ring-brand-blue focus:outline-none"
                                        min="1"
                                        placeholder="0"
                                    />
                                </div>
                                <div className="text-center font-bold">Total: {formatCurrency(Number(tradeShares) * (tradeTab === 'stock' ? quote.price : (selectedOption?.close_price || 0) * 100))}</div>
                                <div className="flex gap-4">
                                    <button onClick={handleBuy} disabled={tradeTab !== 'stock' && !selectedOption} className="w-full bg-brand-green text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 transition-colors disabled:bg-night-600">Buy</button>
                                    <button onClick={handleSell} disabled={(tradeTab === 'stock' && sharesOwned === 0) || (tradeTab !== 'stock' && contractsOwned === 0)} className="w-full bg-brand-red text-white font-bold py-2 px-4 rounded-md hover:bg-red-600 transition-colors disabled:bg-night-600">Sell</button>
                                </div>
                            </div>
                        </Card>
                    ) : (
                         <Card><p className="text-center text-night-500 p-4">Please log in to trade stocks or options.</p></Card>
                    )}
                </div>
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Price Chart</h2>
                            <select
                                value={chartInterval}
                                onChange={(e) => setChartInterval(e.target.value)}
                                className="bg-night-700 border border-night-600 rounded-md py-1 px-2 focus:ring-2 focus:ring-brand-blue focus:outline-none"
                            >
                                <option value="15min">15 Minute</option>
                                <option value="1hour">1 Hour</option>
                                <option value="4hour">4 Hour</option>
                                <option value="1day">1 Day</option>
                                <option value="1week">1 Week</option>
                                <option value="1month">1 Month</option>
                            </select>
                        </div>
                        <CandlestickChart data={historicalData} ticker={ticker as string} />
                    </Card>

                    <div className="border-b border-night-700 mb-6 overflow-x-auto overflow-y-hidden">
                        <nav className="-mb-px flex space-x-8 whitespace-nowrap" aria-label="Tabs">
                            <button onClick={() => setActiveTab('summary')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'summary' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Summary</button>
                            <button onClick={() => setActiveTab('news')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'news' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>News</button>
                            <button onClick={() => setActiveTab('financials')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'financials' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Financials</button>
                            <button onClick={() => setActiveTab('ratings')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'ratings' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Analyst Ratings</button>
                            <button onClick={() => setActiveTab('insider')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'insider' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Insider Trades</button>
                            <button onClick={() => setActiveTab('technical')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'technical' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>AI Technical Analysis</button>
                            <button onClick={() => setActiveTab('advanced')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'advanced' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Advanced Recs</button>
                        </nav>
                    </div>
                    {renderTabContent()}
                </div>
            </div>
        </div>
    );
};

export default StockView;