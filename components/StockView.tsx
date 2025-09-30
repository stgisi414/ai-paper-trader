import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Brush, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import * as fmpService from '../services/fmpService';
import * as geminiService from '../services/geminiService';
import type { FmpQuote, FmpProfile, FmpHistoricalData, FmpNews, AiAnalysis, FmpAnalystRating, FmpIncomeStatement, FmpBalanceSheet, FmpCashFlowStatement, FmpInsiderTrading, FinancialStatementAnalysis, TechnicalAnalysis } from '../types';
import { usePortfolio } from '../hooks/usePortfolio';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters';
import { BrainCircuitIcon } from './common/Icons';

const StockView: React.FC = () => {
    const { ticker } = useParams<{ ticker: string }>();
    const { buyStock, sellStock, portfolio } = usePortfolio();

    const [quote, setQuote] = useState<FmpQuote | null>(null);
    const [profile, setProfile] = useState<FmpProfile | null>(null);
    const [historicalData, setHistoricalData] = useState<FmpHistoricalData[]>([]);
    const [news, setNews] = useState<FmpNews[]>([]);
    const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
    const [analystRatings, setAnalystRatings] = useState<FmpAnalystRating[]>([]);
    const [incomeStatement, setIncomeStatement] = useState<FmpIncomeStatement | null>(null);
    const [balanceSheet, setBalanceSheet] = useState<FmpBalanceSheet | null>(null);
    const [cashFlowStatement, setCashFlowStatement] = useState<FmpCashFlowStatement | null>(null);
    const [insiderTrades, setInsiderTrades] = useState<FmpInsiderTrading[]>([]);
    const [financialStatementAnalysis, setFinancialStatementAnalysis] = useState<FinancialStatementAnalysis | null>(null);
    const [technicalAnalysis, setTechnicalAnalysis] = useState<TechnicalAnalysis | null>(null);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [tradeShares, setTradeShares] = useState(1);
    const [activeTab, setActiveTab] = useState('summary');

    useEffect(() => {
        if (!ticker) return;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [quoteData, profileData, historyData, newsData, ratingsData, incomeData, balanceSheetData, cashFlowData, insiderTradingData] = await Promise.all([
                    fmpService.getQuote(ticker),
                    fmpService.getProfile(ticker),
                    fmpService.getHistoricalData(ticker),
                    fmpService.getNews(ticker, 10),
                    fmpService.getAnalystRatings(ticker),
                    fmpService.getIncomeStatement(ticker),
                    fmpService.getBalanceSheet(ticker),
                    fmpService.getCashFlowStatement(ticker),
                    fmpService.getInsiderTrading(ticker),
                ]);
                setQuote(quoteData[0] || null);
                setProfile(profileData[0] || null);
                setHistoricalData(historyData.historical.reverse());
                setNews(newsData);
                setAnalystRatings(ratingsData);
                setIncomeStatement(incomeData[0] || null);
                setBalanceSheet(balanceSheetData[0] || null);
                setCashFlowStatement(cashFlowData[0] || null);
                setInsiderTrades(insiderTradingData);
            } catch (error) {
                console.error("Failed to fetch stock data:", error);
                alert('Failed to load stock data. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [ticker]);

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

    const handleBuy = () => {
        if (quote && profile && tradeShares > 0) {
            buyStock(quote.symbol, profile.companyName, tradeShares, quote.price);
            alert(`Successfully bought ${tradeShares} share(s) of ${quote.symbol}`);
        }
    };
    
    const handleSell = () => {
        if (quote && tradeShares > 0) {
            sellStock(quote.symbol, tradeShares, quote.price);
            alert(`Successfully sold ${tradeShares} share(s) of ${quote.symbol}`);
        }
    };

    const sharesOwned = portfolio.holdings.find(h => h.ticker === ticker)?.shares || 0;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
    }

    if (!quote || !profile) {
        return <div className="text-center text-red-500 mt-10">Stock data not found for {ticker}.</div>;
    }

    const priceChangeColor = quote.change >= 0 ? 'text-brand-green' : 'text-brand-red';

    const renderTabs = () => (
        <div className="border-b border-night-700 mb-6">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <button onClick={() => setActiveTab('summary')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'summary' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Summary</button>
                <button onClick={() => setActiveTab('financials')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'financials' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Financials</button>
                <button onClick={() => setActiveTab('ratings')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'ratings' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Analyst Ratings</button>
                <button onClick={() => setActiveTab('insider')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'insider' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Insider Trades</button>
                <button onClick={() => setActiveTab('technical')} className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'technical' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>AI Technical Analysis</button>
            </nav>
        </div>
    );

    return (
        <div className="space-y-6">
            <Link to="/" className="text-brand-blue hover:underline">&larr; Back to Dashboard</Link>
            
            <Card>
                <div className="flex items-center gap-4">
                    <img src={profile.image} alt={profile.companyName} className="h-16 w-16 rounded-full"/>
                    <div>
                        <h1 className="text-3xl font-bold">{profile.companyName} ({profile.symbol})</h1>
                        <p className="text-night-500">{quote.exchange}</p>
                    </div>
                </div>
                <div className="mt-4 flex items-baseline gap-4">
                    <span className="text-5xl font-bold">{formatCurrency(quote.price)}</span>
                    <span className={`text-2xl font-semibold ${priceChangeColor}`}>
                        {quote.change >= 0 ? '+' : ''}{formatCurrency(quote.change)} ({formatPercentage(quote.changesPercentage)})
                    </span>
                </div>
            </Card>

            {renderTabs()}

            {activeTab === 'summary' && (
                <>
                    <Card>
                        <h2 className="text-xl font-bold mb-4">Price Chart (1Y)</h2>
                        <ResponsiveContainer width="100%" height={400}>
                            <AreaChart data={historicalData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <defs>
                                    <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#1a73e8" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#1a73e8" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                                <XAxis dataKey="date" tick={{ fill: '#d0d0d0' }} />
                                <YAxis tickFormatter={(value) => formatCurrency(Number(value))} domain={['dataMin', 'dataMax']} tick={{ fill: '#d0d0d0' }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #3c3c3c' }}
                                    labelStyle={{ color: '#d0d0d0' }}
                                    formatter={(value) => [formatCurrency(Number(value)), 'Price']}
                                />
                                <Area type="monotone" dataKey="close" stroke="#1a73e8" fillOpacity={1} fill="url(#colorUv)" activeDot={{ r: 8 }} />
                                <Brush dataKey="date" height={30} stroke="#1a73e8" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </Card>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Card className="lg:col-span-1">
                            <h2 className="text-xl font-bold mb-4">Trade</h2>
                             <div className="space-y-4">
                                <div className="text-sm">Shares Owned: <span className="font-bold">{sharesOwned}</span></div>
                                <div className="text-sm">Cash Available: <span className="font-bold">{formatCurrency(portfolio.cash)}</span></div>
                                <div>
                                    <label htmlFor="shares" className="block text-sm font-medium text-night-100 mb-1">Shares</label>
                                    <input
                                        type="number"
                                        id="shares"
                                        value={tradeShares}
                                        onChange={(e) => setTradeShares(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="w-full bg-night-700 border border-night-600 rounded-md py-2 px-3 focus:ring-2 focus:ring-brand-blue focus:outline-none"
                                        min="1"
                                    />
                                </div>
                                <div className="text-center font-bold">Total: {formatCurrency(tradeShares * quote.price)}</div>
                                <div className="flex gap-4">
                                    <button onClick={handleBuy} className="w-full bg-brand-green text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 transition-colors">Buy</button>
                                    <button onClick={handleSell} disabled={sharesOwned === 0} className="w-full bg-brand-red text-white font-bold py-2 px-4 rounded-md hover:bg-red-600 transition-colors disabled:bg-night-600">Sell</button>
                                </div>
                            </div>
                        </Card>

                        <Card className="lg:col-span-2">
                             <h2 className="text-xl font-bold mb-4">Key Statistics</h2>
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
                        </Card>
                    </div>
                </>
            )}
            
            {activeTab === 'financials' && (
                <Card>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold flex items-center gap-2"><BrainCircuitIcon className="h-6 w-6 text-brand-blue" /> AI Financial Summary</h2>
                        <button onClick={handleFinancialAnalysis} disabled={isAiLoading} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600">
                            {isAiLoading ? 'Analyzing...' : 'Run Analysis'}
                        </button>
                    </div>
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
                </Card>
            )}

            {activeTab === 'ratings' && (
                <Card>
                    <h2 className="text-xl font-bold mb-4">Analyst Ratings</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-night-600">
                                <tr>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Rating</th>
                                    <th className="p-3">Recommendation</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analystRatings.map((rating, index) => (
                                    <tr key={index} className="border-b border-night-700 hover:bg-night-700">
                                        <td className="p-3">{rating.date}</td>
                                        <td className="p-3 font-bold">{rating.rating}</td>
                                        <td className="p-3">{rating.ratingRecommendation}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {activeTab === 'insider' && (
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
                                {insiderTrades.map((trade, index) => (
                                    <tr key={index} className="border-b border-night-700 hover:bg-night-700">
                                        <td className="p-3">{trade.transactionDate}</td>
                                        <td className="p-3">{trade.reportingName}</td>
                                        <td className={`p-3 font-semibold ${trade.transactionType === 'P-Purchase' ? 'text-brand-green' : 'text-brand-red'}`}>{trade.transactionType}</td>
                                        <td className="p-3">{formatNumber(trade.securitiesTransacted)}</td>
                                        <td className="p-3">{formatCurrency(trade.price)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {activeTab === 'technical' && (
                <Card>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold flex items-center gap-2"><BrainCircuitIcon className="h-6 w-6 text-brand-blue" /> AI Technical Analysis</h2>
                        <button onClick={handleTechnicalAnalysis} disabled={isAiLoading} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600">
                            {isAiLoading ? 'Analyzing...' : 'Run Analysis'}
                        </button>
                    </div>
                    {isAiLoading && <Spinner />}
                    {technicalAnalysis && (
                        <div className="bg-night-700 p-4 rounded-lg">
                            <h3 className="text-lg font-bold">Trend: <span className="text-brand-blue">{technicalAnalysis.trend}</span></h3>
                            <p className="text-night-100 mt-2">Support: <span className="font-bold">{formatCurrency(technicalAnalysis.support)}</span></p>
                            <p className="text-night-100">Resistance: <span className="font-bold">{formatCurrency(technicalAnalysis.resistance)}</span></p>
                            <p className="mt-4 text-night-100">{technicalAnalysis.summary}</p>
                        </div>
                    )}
                </Card>
            )}

        </div>
    );
};

export default StockView;