import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom'; // Import ReactDOM for portal
import { useParams, Link } from 'react-router-dom';
import * as fmpService from '../services/fmpService';
import * as geminiService from '../services/geminiService';
import type { FmpQuote, FmpProfile, FmpHistoricalData, FmpNews, AiAnalysis, FmpAnalystRating, FmpIncomeStatement, FmpBalanceSheet, FmpCashFlowStatement, FmpInsiderTrading, FinancialStatementAnalysis, TechnicalAnalysis, CombinedRec, AlpacaOptionContract, OptionHolding, KeyMetricsAnalysis } from '../types';
import { usePortfolio } from '../hooks/usePortfolio';
import { useWatchlist } from '../hooks/useWatchlist';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters';
import { BrainCircuitIcon, StarIcon, HelpCircleIcon, RegenerateIcon } from './common/Icons';
import CandlestickChart from './CandlestickChart';
import * as optionsProxyService from '../services/optionsProxyService';
import ChatPanel from './ChatPanel';
import Watchlist from './Watchlist';
import { useAuth } from '../src/hooks/useAuth.tsx';
import { SignatexMaxIcon, SignatexLiteIcon } from './common/Icons';

type OptionsSortKey = 'strike_price' | 'close_price' | 'impliedVolatility' | 'volume' | 'delta' | 'gamma' | 'theta' | 'vega' | null;
type SortDirection = 'asc' | 'desc';

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

const HelpIconWithTooltip: React.FC<{ tooltip: string }> = ({ tooltip }) => {
    const iconRef = useRef<HTMLDivElement>(null);
    const [isTooltipVisible, setIsTooltipVisible] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

    // Using useCallback to prevent re-creating functions on every render
    const showTooltip = useCallback(() => {
        if (iconRef.current) {
            const rect = iconRef.current.getBoundingClientRect();
            // CORRECTED POSITIONING:
            // Use coordinates directly from getBoundingClientRect since the tooltip is position: fixed
            setTooltipPosition({
                top: rect.bottom, // Use rect.bottom for positioning below the icon
                left: rect.left + (rect.width / 2), // Center horizontally
            });
        }
        setIsTooltipVisible(true);
    }, []);

    const hideTooltip = useCallback(() => {
        setIsTooltipVisible(false);
    }, []);

    // The tooltip element to be rendered in the portal
    const tooltipElement = isTooltipVisible ? (
        <div
            className="fixed bg-night-600 text-white text-xs rounded-md p-2 transition-opacity pointer-events-none"
            style={{
                // Position based on state, add a 5px margin from the icon
                top: `${tooltipPosition.top + 5}px`,
                left: `${tooltipPosition.left}px`,
                // Horizontally center the tooltip itself on the 'left' coordinate
                transform: 'translateX(-50%)',
                // Use a standard maximum z-index
                zIndex: 2147483647,
                opacity: 1,
            }}
        >
            {tooltip}
        </div>
    ) : null;

    return (
        <div
            ref={iconRef}
            className="flex items-center"
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
        >
            <HelpCircleIcon className="h-4 w-4 text-night-500" />
            {/* The portal renders the tooltipElement into the document body, escaping its parents */}
            {tooltipElement && ReactDOM.createPortal(tooltipElement, document.body)}
        </div>
    );
};

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
    const [isOptionsLoading, setIsOptionsLoading] = useState(false);
    // END NEW OPTIONS STATE & LOGIC

    const [isLoading, setIsLoading] = useState(true);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isKeyMetricsLoading, setIsKeyMetricsLoading] = useState(false);
    const [tradeAmount, setTradeAmount] = usePersistentState<number | ''>(`tradeAmount-${ticker}`, 1);
    const [tradeInputMode, setTradeInputMode] = usePersistentState<'shares' | 'dollars'>(`tradeInputMode-${ticker}`, 'shares');
    const [activeTab, setActiveTab] = useState('summary');
    const [tradeTab, setTradeTab] = usePersistentState<'stock' | 'calls' | 'puts'>(`tradeTab-${ticker}`, 'stock');
    
    const [hasRunFinancialAnalysis, setHasRunFinancialAnalysis] = useState(false);
    const [hasRunTechnicalAnalysis, setHasRunTechnicalAnalysis] = useState(false);
    const [hasRunAdvancedRecs, setHasRunAdvancedRecs] = useState(false);

    const [optionsSort, setOptionsSort] = useState<{ key: OptionsSortKey, direction: SortDirection }>({ key: null, direction: 'asc' });

    const expirationDates = useMemo(() => {
        return availableExpirationDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    }, [availableExpirationDates]);

    // MODIFICATION: Add sorting logic to filteredOptions calculation
    const filteredOptions = useMemo(() => {
        if (!options) return []; 

        let filtered = options.filter(o => 
            o.type === (tradeTab === 'calls' ? 'call' : 'put') &&
            o.expiration_date === selectedExpiry
        );
        
        // ADDITION: Apply Sorting
        if (optionsSort.key) {
            const { key, direction } = optionsSort;
            
            filtered = filtered.sort((a, b) => {
                let aVal: number = 0;
                let bVal: number = 0;

                if (key === 'volume') {
                    // Combine Open Interest (open_interest) and Volume for a weighted sort if key is 'volume'
                    // Fall back to 0 if either is null
                    aVal = (a.volume || 0) + (a.open_interest || 0);
                    bVal = (b.volume || 0) + (b.open_interest || 0);
                } else if (key === 'strike_price') {
                    // Strike price is a string, parse it to float
                    aVal = parseFloat(a[key]);
                    bVal = parseFloat(b[key]);
                } else {
                    // For all other numeric keys (close_price, IV, Greeks)
                    aVal = (a[key] as number) || 0;
                    bVal = (b[key] as number) || 0;
                }

                if (aVal < bVal) return direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return filtered;
    }, [options, tradeTab, selectedExpiry, optionsSort]);

    useEffect(() => {
        if (!ticker) return;
        const fetchData = async () => {
            setIsLoading(true);

            // Clear out old data when a new ticker is loaded
            setQuote(null);
            setProfile(null);
            setHistoricalData([]);
            setNews([]);
            setAiAnalysis(null);
            setAnalystRatings([]);
            setIncomeStatement(null);
            setBalanceSheet(null);
            setCashFlowStatement(null);
            setInsiderTrades([]);
            setFinancialStatementAnalysis(null);
            setTechnicalAnalysis(null);
            setCombinedRec(null);
            setKeyMetricsAnalysis(null);
            setOptions([]);
            setAvailableExpirationDates([]);
            setSelectedExpiry('');
            setHasRunFinancialAnalysis(false);
            setHasRunTechnicalAnalysis(false);
            setHasRunAdvancedRecs(false);

            // ADDITION: Helper function to safely extract fulfilled promise values (for Promise.allSettled)
            const extractValue = <T,>(result: PromiseSettledResult<T>, defaultValue: T): T => {
                if (result.status === 'fulfilled' && result.value) {
                    return result.value;
                }
                if (result.status === 'rejected') {
                    console.warn('Data fetch failed (StockView):', result.reason);
                }
                return defaultValue;
            };

            try {
                // FIX: Use Promise.allSettled to prevent a single network error from blocking the whole component load
                const results = await Promise.allSettled([
                    fmpService.getQuote(ticker),
                    fmpService.getProfile(ticker),
                    fmpService.getHistoricalData(ticker, chartInterval),
                    fmpService.getNews(ticker, 10),
                    fmpService.getAnalystRatings(ticker),
                    fmpService.getIncomeStatement(ticker),
                    fmpService.getBalanceSheet(ticker),
                    fmpService.getCashFlowStatement(ticker),
                    fmpService.getInsiderTrading(ticker),
                    optionsProxyService.getOptionsChain(ticker), // This call gets the dates
                ]);
                
                // MODIFICATION: Safely extract and assign data, providing default values if a fetch failed
                const quoteData = extractValue(results[0] as PromiseSettledResult<FmpQuote[]>, []);
                const profileData = extractValue(results[1] as PromiseSettledResult<FmpProfile[]>, []);
                const historyData = extractValue(results[2] as PromiseSettledResult<{ historical: FmpHistoricalData[] }>, { historical: [] });
                const newsData = extractValue(results[3] as PromiseSettledResult<FmpNews[]>, []);
                const ratingsData = extractValue(results[4] as PromiseSettledResult<FmpAnalystRating[]>, []);
                const incomeData = extractValue(results[5] as PromiseSettledResult<FmpIncomeStatement[]>, []);
                const balanceSheetData = extractValue(results[6] as PromiseSettledResult<FmpBalanceSheet[]>, []);
                const cashFlowData = extractValue(results[7] as PromiseSettledResult<FmpCashFlowStatement[]>, []);
                const insiderTradingData = extractValue(results[8] as PromiseSettledResult<FmpInsiderTrading[]>, []);
                const optionsInitialResult = extractValue(results[9] as PromiseSettledResult<optionsProxyService.OptionsChainResult>, { contracts: [], availableExpirationDates: [] });

                
                setQuote(quoteData[0] || null);
                setProfile(profileData[0] || null);
                // Ensure historical is an array for safety
                const historical = historyData.historical ? historyData.historical.reverse() : [];
                setHistoricalData(historical);
                setNews(newsData);
                setAnalystRatings(ratingsData);
                setIncomeStatement(incomeData[0] || null);
                setBalanceSheet(balanceSheetData[0] || null);
                setCashFlowStatement(cashFlowData[0] || null);
                setInsiderTrades(insiderTradingData);
                
                if (optionsInitialResult.availableExpirationDates.length > 0) {
                    const sortedDates = optionsInitialResult.availableExpirationDates.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
                    setAvailableExpirationDates(sortedDates);
                    // Set the first date as the selected one, which will trigger the next useEffect
                    setSelectedExpiry(sortedDates[0]); 
                }
            } catch (error) {
                // This catch block will now only handle genuine critical errors with Promise.allSettled itself
                console.error("Failed to fetch stock data (critical error in Promise.allSettled):", error);
                alert('A critical error occurred during initial data loading.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [ticker, chartInterval, setCombinedRec]);

    // ADDITION: New effect to fetch options data when the selected expiry changes
    useEffect(() => {
        if (!ticker || !selectedExpiry) return;

        const fetchOptionsForDate = async () => {
            setIsOptionsLoading(true);
            setOptions([]); // Clear out old options before fetching new ones
            try {
                const optionsResult = await optionsProxyService.getOptionsChain(ticker, selectedExpiry);
                setOptions(optionsResult.contracts);
            } catch (error) {
                console.error(`Failed to fetch options for date ${selectedExpiry}:`, error);
            } finally {
                setIsOptionsLoading(false);
            }
        };

        fetchOptionsForDate();
    }, [selectedExpiry, ticker]); // This effect now handles fetching options data

    // ADDITION: Handler to update sort state when a header is clicked
    const handleSort = (key: OptionsSortKey) => {
        setOptionsSort(prev => {
            if (prev.key === key) {
                // If clicking the same column, toggle direction
                return { 
                    key, 
                    direction: prev.direction === 'asc' ? 'desc' : 'asc' 
                };
            }
            // If clicking a new column, set ascending sort
            return { key, direction: 'asc' };
        });
    };
    
    // ADDITION: Helper function to render the sort arrow icon
    const renderSortIcon = (key: OptionsSortKey) => {
        if (optionsSort.key !== key) return null;
        return (
            <span className="ml-1 text-xs">
                {optionsSort.direction === 'asc' ? '▲' : '▼'}
            </span>
        );
    };

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
        // FIX: Remove the strict check for analystRatings to allow analysis for ETFs and other assets.
        if (!profile || historicalData.length === 0) {
            alert("Not enough data to generate a recommendation. Please ensure the profile and price chart have loaded.");
            return;
        }
        setIsAiLoading(true);
        setHasRunAdvancedRecs(true);
        setCombinedRec(null); // This correctly clears the previous state to prevent stale data.
        try {
            const technicals = await geminiService.getTechnicalAnalysis(historicalData);
            setTechnicalAnalysis(technicals);
            // The analystRatings array will now be passed, even if it's empty. The updated AI service will handle it.
            const recommendation = await geminiService.getCombinedRecommendations(profile, analystRatings, technicals);
            setCombinedRec(recommendation);

        } catch (error) {
            console.error("AI Advanced Recommendations failed:", error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            alert(`The AI recommendation could not be completed. Reason: ${errorMessage}`);
        } finally {
            setIsAiLoading(false);
        }
    }, [profile, historicalData, analystRatings, setCombinedRec]);

    // ADDITION: Helper function to calculate the strict minimum intrinsic value
    const calculateIntrinsicValueFloor = (stockPrice: number, strikePrice: number, optionType: 'call' | 'put'): number => {
        if (optionType === 'call') {
            // Intrinsic Value for a Call: max(0, Stock Price - Strike Price)
            return Math.max(0, stockPrice - strikePrice);
        } else if (optionType === 'put') {
            // Intrinsic Value for a Put: max(0, Strike Price - Stock Price)
            return Math.max(0, strikePrice - stockPrice);
        }
        return 0;
    };

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
            if (!isNaN(numValue) && numValue >= 0) {
                setTradeShares(numValue);
            }
        }
    };

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        if (value === '') {
            setTradeAmount('');
        } else {
            const numValue = parseFloat(value);
            // Allow 0 and fractions, but not negative numbers
            setTradeAmount(Math.max(0, numValue) || '');
        }
    };
    
    const handleBuy = () => {
        const amount = Number(tradeAmount);
        if (amount <= 0 || !quote) return;

        if (tradeTab === 'stock' && profile) {
            // Calculate shares based on input mode
            const sharesToBuy = tradeInputMode === 'shares' ? amount : amount / quote.price;
            if (sharesToBuy <= 0) {
                alert("Please enter a valid amount.");
                return;
            }
            buyStock(quote.symbol, profile.companyName, sharesToBuy, quote.price);
            alert(`Successfully bought ${sharesToBuy.toFixed(4)} share(s) of ${quote.symbol}`);
        } else if (selectedOption) {
            const contractsToBuy = amount;
            // ... (rest of the existing option buying logic)
            // --- ENHANCED ARBITRAGE PREVENTION CHECK ---
            const currentStockPrice = quote.price;
            const strikePrice = parseFloat(selectedOption.strike_price);
            const marketPremium = selectedOption.close_price || 0;
            const impliedVolatility = selectedOption.impliedVolatility || 0; 
            
            const intrinsicFloor = calculateIntrinsicValueFloor(currentStockPrice, strikePrice, selectedOption.type);
            
            const epsilon = 0.0001; 

            if (marketPremium < intrinsicFloor - epsilon) {
                 alert(`Arbitrage attempt prevented. The listed premium (\$${marketPremium.toFixed(2)}) is below the intrinsic floor (\$${intrinsicFloor.toFixed(2)}). This is stale data. Please select another option or try again.`);
                 return;
            }
            
            if (Math.abs(marketPremium - intrinsicFloor) < epsilon && impliedVolatility < epsilon) {
                 alert(`Arbitrage attempt prevented. The listed premium (\$${marketPremium.toFixed(2)}) is equal to the intrinsic floor and has 0.00% Implied Volatility. This indicates critically flawed (stale or static) data and no real time value. Please select another option.`);
                 return;
            }
            
            if (portfolio.cash < contractsToBuy * marketPremium * 100) {
                 alert("Not enough cash to complete option purchase.");
                 return;
            }
            // --- END ARBITRAGE PREVENTION CHECK ---

            const optionToBuy: OptionHolding = {
                symbol: selectedOption.symbol,
                underlyingTicker: selectedOption.underlying_symbol,
                shares: shares,
                purchasePrice: marketPremium, 
                currentPrice: marketPremium,
                // FIX: Add change and changesPercentage when buying a new option
                change: selectedOption.change || 0,
                changesPercentage: selectedOption.changesPercentage || 0,
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
            alert(`Successfully bought ${contractsToBuy} contract(s) of ${selectedOption.symbol}`);
        }
    };
    
    const handleSell = () => {
        const amount = Number(tradeAmount);
        if (amount <= 0 || !quote) return;

        if (tradeTab === 'stock') {
            // Calculate shares based on input mode
            const sharesToSell = tradeInputMode === 'shares' ? amount : amount / quote.price;
            if (sharesToSell <= 0) {
                alert("Please enter a valid amount.");
                return;
            }
            sellStock(quote.symbol, sharesToSell, quote.price);
            alert(`Successfully sold ${sharesToSell.toFixed(4)} share(s) of ${quote.symbol}`);
        } else if (selectedOption) {
            const contractsToSell = amount;
            sellOption(selectedOption.symbol, contractsToSell, selectedOption.close_price || 0);
             alert(`Successfully sold ${contractsToSell} contract(s) of ${selectedOption.symbol}`);
        }
    };

    const handleSellAll = () => {
        if (tradeTab !== 'stock' || sharesOwned <= 0 || !quote) return;

        // Use the sellStock function with the total number of shares owned
        sellStock(quote.symbol, sharesOwned, quote.price);
        alert(`Successfully sold all ${sharesOwned.toFixed(4)} share(s) of ${quote.symbol}`);
        setTradeAmount(''); // Clear the input after selling
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

    const quantity = Number(tradeAmount) || 0;
    const isStockTrade = tradeTab === 'stock';

    const totalTradeValue = isStockTrade
        ? (tradeInputMode === 'dollars' ? quantity : quantity * (quote?.price || 0))
        : quantity * (selectedOption?.close_price || 0) * 100;

    // Safely get the price per unit (either stock price or option premium per contract)
    const pricePerUnit = isStockTrade
        ? quote?.price || 0
        : (selectedOption?.close_price || 0) * 100;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
    }

    if (!quote || !profile) {
        return <div className="text-center text-red-500 mt-10">Stock data not found for {ticker}.</div>;
    }

    const tradePrice = tradeTab === 'stock' ? (quote?.price || 0) : (selectedOption?.close_price || 0);
    const multiplier = tradeTab === 'stock' ? 1 : 100;

    const priceChangeColor = quote.change >= 0 ? 'text-brand-green' : 'text-brand-red';
    const onWatchlist = ticker ? isOnWatchlist(ticker) : false;

    const renderTabContent = () => {
        // This is the new, reusable section for the AI recommendation
        const smartRecSection = (
            <div className="bg-night-700 p-4 rounded-lg mt-6 border-l-4 border-brand-blue">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <BrainCircuitIcon className="h-5 w-5 text-brand-blue" /> AI Smart Recommendation
                    </h3>
                    {/* FIX: Add Regenerate Button */}
                    {combinedRec && !isAiLoading && (
                         <button onClick={handleAdvancedRecommendations} className="text-night-500 hover:text-yellow-400" title="Regenerate Recommendation">
                            <SignatexLiteIcon className="h-5 w-5 inline mr-1 mb-1" />
                            <RegenerateIcon className="h-5 w-5" />
                        </button>
                    )}
                </div>

                {(isAiLoading && hasRunAdvancedRecs) ? (
                     <div className="mt-2 flex justify-center"><Spinner /></div>
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
                            <SignatexLiteIcon className="h-5 w-5 inline mr-1 mb-1" />
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
                                <SignatexLiteIcon className="h-5 w-5 inline mr-1 mb-1" />
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
                                <SignatexLiteIcon className="h-5 w-5 inline mr-1 mb-1" />
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
                                <SignatexMaxIcon className="h-5 w-5 inline mr-1 mb-1" />
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
                                    {/* FIX: Access the 'point' property of the object */}
                                    {financialStatementAnalysis.strengths.map((item, index) => <li key={index}>{item.point}</li>)}
                                </ul>
                                <h3 className="text-lg font-bold mt-4">Weaknesses</h3>
                                <ul className="list-disc list-inside text-brand-red">
                                    {/* FIX: Access the 'point' property of the object */}
                                    {financialStatementAnalysis.weaknesses.map((item, index) => <li key={index}>{item.point}</li>)}
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
                                <SignatexLiteIcon className="h-5 w-5 inline mr-1 mb-1" />
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

            {/* MODIFICATION: The layout of content within the grid columns is swapped */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                
                {/* LEFT COLUMN (lg:col-span-2) - Only contains Watchlist now */}
                <div className="lg:col-span-2 space-y-6"> 
                    {user && <Watchlist />}
                </div>

                {/* RIGHT COLUMN (lg:col-span-3) - Now contains Chart, Trade Card, and Tabs/Content */}
                <div className="lg:col-span-3 space-y-6">
                    
                    {/* 1. Chart Card (REMAINS HERE) */}
                    <Card>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Price Chart</h2>
                            <select
                                id="chart-interval-select"
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

                    {/* 2. Trade Card (MOVED HERE) */}
                    {user ? (
                        <Card>
                            <h2 className="text-xl font-bold mb-4">Trade</h2>
                            <div className="border-b border-night-700 mb-4">
                                <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                                    <button onClick={() => handleTradeTabChange('stock')} data-cy="trade-tab-stock" className={`whitespace-nowrap pb-2 px-1 border-b-2 font-medium text-sm ${tradeTab === 'stock' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>Stock</button>
                                    <button onClick={() => handleTradeTabChange('calls')} data-cy="trade-tab-calls" className={`flex items-center gap-1 whitespace-nowrap pb-2 px-1 border-b-2 font-medium text-sm ${tradeTab === 'calls' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>
                                        Calls <HelpIconWithTooltip tooltip="Call options give the holder the right, but not the obligation, to buy a stock at a specified price before a certain date." />
                                    </button>
                                    <button onClick={() => handleTradeTabChange('puts')} data-cy="trade-tab-puts" className={`flex items-center gap-1 whitespace-nowrap pb-2 px-1 border-b-2 font-medium text-sm ${tradeTab === 'puts' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-night-500 hover:text-night-100 hover:border-night-100'}`}>
                                        Puts <HelpIconWithTooltip tooltip="Put options give the holder the right, but not the obligation, to sell a stock at a specified price before a certain date." />
                                    </button>
                                </nav>
                            </div>
                            <div className="space-y-4">
                                {tradeTab === 'stock' && (
                                    <>
                                        <div className="text-sm">Shares Owned: <span className="font-bold">{sharesOwned.toFixed(4)}</span></div>
                                        <div className="text-sm">Cash Available: <span className="font-bold">{formatCurrency(portfolio.cash)}</span></div>
                                        
                                        {/* ADDITION START: Mode Toggle */}
                                        <div className="flex bg-night-700 rounded-md p-1">
                                            <button 
                                                onClick={() => setTradeInputMode('shares')}
                                                className={`w-1/2 py-1 rounded-md text-sm font-semibold transition-colors ${tradeInputMode === 'shares' ? 'bg-brand-blue text-white' : 'text-night-100'}`}
                                            >
                                                Shares
                                            </button>
                                            <button 
                                                onClick={() => setTradeInputMode('dollars')}
                                                className={`w-1/2 py-1 rounded-md text-sm font-semibold transition-colors ${tradeInputMode === 'dollars' ? 'bg-brand-blue text-white' : 'text-night-100'}`}
                                            >
                                                Dollars
                                            </button>
                                        </div>
                                        {/* ADDITION END */}
                                    </>
                                )}
                                
                                {/* Expiration Date Selector for Options */}
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
                                        <div className="w-full"> 
                                            <table className="w-full text-left text-xs table-auto"> 
                                                <thead>
                                                    <tr>
                                                        <th className="p-2 whitespace-nowrap cursor-pointer hover:text-brand-blue" onClick={() => handleSort('strike_price')}>
                                                            Strike {renderSortIcon('strike_price')}
                                                        </th>
                                                        <th className="p-2 whitespace-nowrap">Expiry</th>
                                                        <th className="p-2 whitespace-nowrap cursor-pointer hover:text-brand-blue" onClick={() => handleSort('close_price')}>
                                                            Price {renderSortIcon('close_price')}
                                                        </th>
                                                        <th className="p-2 whitespace-nowrap cursor-pointer hover:text-brand-blue" onClick={() => handleSort('impliedVolatility')}>
                                                            <div className="flex items-center gap-1">
                                                                IV {renderSortIcon('impliedVolatility')} <HelpIconWithTooltip tooltip="Implied Volatility: The market's forecast of a likely movement in a security's price." />
                                                            </div>
                                                        </th>
                                                        <th className="p-2 whitespace-nowrap cursor-pointer hover:text-brand-blue" onClick={() => handleSort('volume')}>
                                                            <div className="flex items-center gap-1">
                                                                OI/Vol {renderSortIcon('volume')}
                                                            </div>
                                                        </th>
                                                        <th className="p-2 whitespace-nowrap cursor-pointer hover:text-brand-blue" onClick={() => handleSort('delta')}>
                                                            <div className="flex items-center gap-1">
                                                                &Delta; {renderSortIcon('delta')} <HelpIconWithTooltip tooltip="Delta: Rate of change of an option's price relative to a $1 change in the underlying asset's price." />
                                                            </div>
                                                        </th>
                                                        <th className="p-2 whitespace-nowrap cursor-pointer hover:text-brand-blue" onClick={() => handleSort('gamma')}>
                                                            <div className="flex items-center gap-1">
                                                                &Gamma; {renderSortIcon('gamma')} <HelpIconWithTooltip tooltip="Gamma: Rate of change in an option's delta per $1 change in the underlying asset price." />
                                                            </div>
                                                        </th>
                                                        <th className="p-2 whitespace-nowrap cursor-pointer hover:text-brand-blue" onClick={() => handleSort('theta')}>
                                                            <div className="flex items-center gap-1">
                                                                &Theta; {renderSortIcon('theta')} <HelpIconWithTooltip tooltip="Theta: Rate of decline in the value of an option due to the passage of time." />
                                                            </div>
                                                        </th>
                                                        <th className="p-2 whitespace-nowrap cursor-pointer hover:text-brand-blue" onClick={() => handleSort('vega')}>
                                                            <div className="flex items-center gap-1">
                                                                &nu; {renderSortIcon('vega')} <HelpIconWithTooltip tooltip="Vega: Rate of change in an option's price for a 1% change in the implied volatility." />
                                                            </div>
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {isOptionsLoading ? (
                                                        <tr>
                                                            <td colSpan={10} className="text-center p-3"><Spinner /></td>
                                                        </tr>
                                                    ) : filteredOptions.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={10} className="text-center text-night-500 p-3">No {tradeTab} options for this date.</td>
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
                                    </div>
                                )}
                                
                                {selectedOption && (tradeTab === 'calls' || tradeTab === 'puts') && (
                                     <div className="text-sm bg-night-700 p-2 rounded-md">
                                        Selected: {selectedOption.symbol} <br/>
                                        Contracts Owned: <span className="font-bold">{contractsOwned}</span>
                                    </div>
                                )}
                                
                                <div>
                                    {/* MODIFICATION: Dynamic label for the input */}
                                    <label htmlFor="trade-amount" className="block text-sm font-medium text-night-100 mb-1">
                                        {tradeTab === 'stock' ? (tradeInputMode === 'shares' ? 'Shares' : 'Amount ($)') : 'Contracts'}
                                    </label>
                                    <input
                                        type="number"
                                        id="trade-amount"
                                        value={tradeAmount}
                                        onChange={handleAmountChange}
                                        className="w-full bg-night-700 border border-night-600 rounded-md py-2 px-3 focus:ring-2 focus:ring-brand-blue focus:outline-none"
                                        min="0"
                                        step="any" // Allow decimals for dollar amount
                                        placeholder="0"
                                    />
                                </div>
                                {/* MODIFICATION: Use the new totalTradeValue variable */}
                                <div className="text-center font-bold">Total: {formatCurrency(totalTradeValue)}</div>
                                <div className="flex gap-2">
                                    <button onClick={handleBuy} disabled={!tradeAmount || (tradeTab !== 'stock' && !selectedOption)} className="w-full bg-brand-green text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 transition-colors disabled:bg-night-600">Buy</button>
                                    
                                    {/* Show "Sell All" button only for stock trades */}
                                    {tradeTab === 'stock' && (
                                        <button 
                                            onClick={handleSellAll} 
                                            disabled={sharesOwned === 0} 
                                            className="w-full bg-yellow-600 text-white font-bold py-2 px-4 rounded-md hover:bg-yellow-700 transition-colors disabled:bg-night-600"
                                        >
                                            Sell All
                                        </button>
                                    )}

                                    <button 
                                        onClick={handleSell} 
                                        disabled={!tradeAmount || (tradeTab === 'stock' && sharesOwned === 0) || (tradeTab !== 'stock' && contractsOwned === 0)} 
                                        className="w-full bg-brand-red text-white font-bold py-2 px-4 rounded-md hover:bg-red-600 transition-colors disabled:bg-night-600"
                                    >
                                        Sell
                                    </button>
                                </div>
                            </div>
                        </Card>
                    ) : (
                         <Card><p className="text-center text-night-500 p-4">Please log in to trade stocks or options.</p></Card>
                    )}
                    
                    {/* Tabs Navigation (REMAINS HERE) */}
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
                    
                    {/* Tab Content (REMAINS HERE) */}
                    {renderTabContent()}
                </div>
            </div>
        </div>
    );
};

export default StockView;