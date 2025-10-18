import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../hooks/usePortfolio';
import * as fmpService from '../services/fmpService';
import * as geminiService from '../services/geminiService';
import type { FmpSearchResult, PortfolioRiskAnalysis } from '../types';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters';
import { SearchIcon, TrendingUpIcon, TrendingDownIcon, DollarSignIcon, BriefcaseIcon, BrainCircuitIcon } from './common/Icons';
import ChatPanel from './ChatPanel';
import Watchlist from './Watchlist';
import MarketScreener from './MarketScreener';
import ActiveUsers from './ActiveUsers';
import { useAuth } from '../src/hooks/useAuth.tsx';
import { SignatexMaxIcon } from './common/Icons';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const { portfolio, totalValue, isLoading: isPortfolioLoading, manualSellOption, sellAllStock } = usePortfolio();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<FmpSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchAttempted, setSearchAttempted] = useState(false);
    const [portfolioAnalysis, setPortfolioAnalysis] = useState<PortfolioRiskAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [testResult, setTestResult] = useState<{ name: string, result: string } | null>(null);
    const [isTesting, setIsTesting] = useState(false);
    const [testTicker, setTestTicker] = useState('AAPL');

    const handleToolTest = useCallback(async (testName: string, prompt: string, ticker: string) => {
        if (!ticker) {
             alert('Please enter a ticker symbol for the test.');
             return;
        }
        setIsTesting(true);
        setTestResult(null);
        try {
            const result = await geminiService.runToolCallingTest(testName, prompt, ticker);
            console.log(`Gemini Tool Test [${testName}] successful:`, result);
            setTestResult({ name: testName, result: result.text });
        } catch (error) {
            console.error(`Gemini Tool Test [${testName}] failed:`, error);
            setTestResult({ name: testName, result: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}` });
        } finally {
            setIsTesting(false);
        }
    }, []);

    const handleSearch = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setSearchAttempted(false);
            return;
        }
        setIsSearching(true);
        setSearchAttempted(true);
        try {
            const results = await fmpService.searchStocks(searchQuery);
            setSearchResults(results.slice(0, 5));
        } catch (error) {
            console.error("Search failed:", error);
            console.error("Failed to search for stocks.");
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [searchQuery]);

    const handlePortfolioAnalysis = useCallback(async () => {
        setIsAnalyzing(true);
        setPortfolioAnalysis(null);
        try {
            const analysis = await geminiService.analyzePortfolioRisk(portfolio);
            setPortfolioAnalysis(analysis);
        } catch (error) {
            console.error("Portfolio analysis failed:", error);
            console.error("The AI portfolio analysis could not be completed.");
        } finally {
            setIsAnalyzing(false);
        }
    }, [portfolio]);
    
    const holdingsValue = totalValue - portfolio.cash;
    const totalGain = totalValue - portfolio.initialValue;
    const totalGainPercent = portfolio.initialValue > 0 ? (totalGain / portfolio.initialValue) * 100 : 0;
    
    const totalDailyStockGain = portfolio.holdings.reduce((acc, h) => acc + (h.shares * (h.change || 0)), 0);
    const totalDailyOptionGain = portfolio.optionHoldings.reduce((acc, o) => acc + (o.shares * (o.change || 0) * 100), 0);
    const totalDailyGain = totalDailyStockGain + totalDailyOptionGain;
    
    const previousTotalValue = totalValue - totalDailyGain;
    const totalDailyGainPercent = previousTotalValue > 0 ? (totalDailyGain / previousTotalValue) * 100 : 0;
    
    const GainLossIcon = totalGain !== 0 ? (totalGain >= 0 ? TrendingUpIcon : TrendingDownIcon) : (totalDailyGain >= 0 ? TrendingUpIcon : TrendingDownIcon);

    return (
        <div>
            {user && <ChatPanel />}
            <div className="text-center">
                <h1 className="text-4xl font-bold">Signatex.co</h1>
                <p className="text-night-500 mt-2">Make smarter trades with the power of AI.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                <div className="lg:col-span-1">
                    {user ? <Watchlist /> : <Card><p className="text-center text-night-500 p-4">Log in to view your Watchlist.</p></Card>}
                </div>
                <div className="lg:col-span-2 space-y-8">
                    <Card>
                        <form onSubmit={handleSearch} className="flex items-center gap-4">
                            <div className="relative flex-grow">
                                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-night-500" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Search for a stock ticker (e.g., AAPL)"
                                    className="w-full bg-night-700 border border-night-600 rounded-md py-3 pl-10 pr-4 focus:ring-2 focus:ring-brand-blue focus:outline-none"
                                />
                            </div>
                            <button type="submit" disabled={isSearching} className="bg-brand-blue text-white font-bold py-3 px-6 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600">
                                {isSearching ? <Spinner /> : 'Search'}
                            </button>
                        </form>

                        {searchAttempted && !isSearching && searchResults.length === 0 && (
                            <div className="text-center p-4 text-night-500 border-t border-night-700 mt-4">
                                No stocks found for "{searchQuery}".
                            </div>
                        )}

                        {searchResults.length > 0 && (
                            <ul className="mt-4 border-t border-night-700 pt-4">
                                {searchResults.map((stock) => (
                                    <li key={stock.symbol}>
                                        <Link to={`/stock/${stock.symbol}`} className="block p-3 rounded-md hover:bg-night-700">
                                            <span className="font-bold">{stock.symbol}</span> - <span className="text-night-100">{stock.name}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Card>

                    {import.meta.env.DEV && (
                        <Card>
                            <h2 className="text-2xl font-bold mb-4">Gemini Tool Calling Tests</h2>
                            <p className="text-sm text-night-500 mb-4">
                                These buttons test the AI's ability to use tools. They simulate user research commands in the AI Assistant.
                            </p>
                            <div className="mb-4">
                                <label htmlFor="test-ticker" className="block text-sm font-medium text-night-100 mb-1">Test Ticker</label>
                                <input
                                    type="text"
                                    id="test-ticker"
                                    value={testTicker}
                                    onChange={(e) => setTestTicker(e.target.value.toUpperCase())}
                                    placeholder="e.g., MSFT or AAPL"
                                    className="w-full bg-night-700 border border-night-600 rounded-md py-2 px-4 focus:ring-2 focus:ring-brand-blue focus:outline-none"
                                />
                            </div>
                            <div className="flex flex-wrap gap-4">
                                <button 
                                    onClick={() => handleToolTest('Get Price', `Get the current stock price for ${testTicker} using the available tool.`, testTicker)} 
                                    disabled={isTesting || !testTicker} 
                                    className="bg-brand-green text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 transition-colors disabled:bg-night-600"
                                >
                                    {isTesting ? 'Testing...' : `Price for ${testTicker}`}
                                </button>
                                <button 
                                    onClick={() => handleToolTest('Get News', `Find the top 5 recent news articles for ${testTicker}.`, testTicker)} 
                                    disabled={isTesting || !testTicker} 
                                    className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 transition-colors disabled:bg-night-600"
                                >
                                    {isTesting ? 'Testing...' : `News for ${testTicker}`}
                                </button>
                                <button 
                                    onClick={() => handleToolTest('Sentiment', `What is the analyst sentiment for ${testTicker}?`, testTicker)} 
                                    disabled={isTesting || !testTicker} 
                                    className="bg-purple-600 text-white font-bold py-2 px-4 rounded-md hover:bg-purple-700 transition-colors disabled:bg-night-600"
                                >
                                    {isTesting ? 'Testing...' : `Sentiment for ${testTicker}`}
                                </button>
                                <button 
                                    onClick={() => handleToolTest('Call Options', `What are the next available call options for ${testTicker}?`, testTicker)} 
                                    disabled={isTesting || !testTicker} 
                                    className="bg-yellow-600 text-white font-bold py-2 px-4 rounded-md hover:bg-yellow-700 transition-colors disabled:bg-night-600"
                                >
                                    {isTesting ? 'Testing...' : `Call Options for ${testTicker}`}
                                </button>
                                <button 
                                    onClick={() => handleToolTest('Combined Price/Options', `What is the latest price for ${testTicker} and what are its next available options?`, testTicker)} 
                                    disabled={isTesting || !testTicker} 
                                    className="bg-orange-600 text-white font-bold py-2 px-4 rounded-md hover:bg-orange-700 transition-colors disabled:bg-night-600"
                                >
                                    {isTesting ? 'Testing...' : `Combined for ${testTicker}`}
                                </button>
                                <button 
                                    onClick={() => handleToolTest('Complex FMP Data', `What are the latest key metrics for ${testTicker}? Use get_fmp_data.`, testTicker)} 
                                    disabled={isTesting || !testTicker} 
                                    className="bg-gray-600 text-white font-bold py-2 px-4 rounded-md hover:bg-gray-700 transition-colors disabled:bg-night-600"
                                >
                                    {isTesting ? 'Testing...' : `Complex FMP for ${testTicker}`}
                                </button>
                            </div>
                             {isTesting && <Spinner />}
                             {testResult && (
                                <div className="mt-4">
                                    <h3 className="font-bold text-lg">Test Result: {testResult.name} ({testTicker})</h3>
                                    <div className={`mt-2 p-3 rounded-md text-sm whitespace-pre-wrap ${testResult.result.startsWith('Failed') ? 'bg-red-900/50 text-red-200' : 'bg-green-900/50 text-green-200'}`}>
                                        {testResult.result}
                                    </div>
                                </div>
                            )}
                        </Card>
                    )}

                    {user ? (
                        <Card>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold flex items-center gap-2"><BrainCircuitIcon className="h-6 w-6 text-brand-blue" /> AI Portfolio Risk Analysis</h2>
                                <button onClick={handlePortfolioAnalysis} disabled={isAnalyzing} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600">
                                    <SignatexMaxIcon className="h-5 w-5 inline mb-1 mr-1" />
                                    {isAnalyzing ? 'Analyzing...' : 'Run Risk Analysis'}
                                </button>
                            </div>
                            {isAnalyzing && <Spinner />}
                            {portfolioAnalysis && (
                                <div className="bg-night-700 p-4 rounded-lg">
                                    <h3 className="text-lg font-bold">Risk Level: <span className="text-brand-blue">{portfolioAnalysis.riskLevel ?? 'N/A'}</span></h3>
                                    <p className="text-night-100 mt-2">
                                        Highest Sector Concentration: <span className="font-bold">
                                            {portfolioAnalysis.concentration?.highestSector ?? 'N/A'} 
                                            ({formatPercentage(portfolioAnalysis.concentration?.percentage)})
                                        </span>
                                    </p>
                                    <h3 className="text-lg font-bold mt-4">Suggestions</h3>
                                    <ul className="list-disc list-inside text-night-100">
                                        {portfolioAnalysis.suggestions?.map((item, index) => <li key={index}>{item}</li>) ?? <li>No specific suggestions provided by AI.</li>}
                                    </ul>
                                </div>
                            )}
                        </Card>
                    ) : (
                        <Card><p className="text-center text-night-500 p-4">Log in to run AI Portfolio Risk Analysis.</p></Card>
                    )}

                    {user ? (
                        <Card>
                            <h2 className="text-2xl font-bold mb-4">Portfolio Overview</h2>
                            {isPortfolioLoading ? <Spinner /> : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> 
                                    <div className="bg-night-700 p-4 rounded-lg flex items-center gap-4">
                                        <BriefcaseIcon className="h-8 w-8 text-brand-blue" />
                                        <div>
                                            <div className="text-sm text-night-500">Total Value</div>
                                            <div className="text-3xl font-bold">{formatCurrency(totalValue)}</div>
                                        </div>
                                    </div>
                                    <div className="bg-night-700 p-4 rounded-lg flex items-center gap-4">
                                        <GainLossIcon className={`h-8 w-8 ${totalGain >= 0 ? 'text-brand-green' : 'text-brand-red'}`} />
                                        <div className="flex flex-col">
                                            <div>
                                                <div className="text-xs text-night-500">Open G/L</div>
                                                <div className={`text-lg font-bold ${totalGain >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                                                    {formatCurrency(totalGain)} ({formatPercentage(totalGainPercent)})
                                                </div>
                                            </div>
                                            <div className="mt-1">
                                                <div className="text-xs text-night-500">Day's G/L</div>
                                                <div className={`text-lg font-bold ${totalDailyGain >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                                                    {formatCurrency(totalDailyGain)} ({formatPercentage(totalDailyGainPercent)})
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-night-700 p-4 rounded-lg flex items-center gap-4">
                                        <DollarSignIcon className="h-8 w-8 text-brand-green" />
                                        <div>
                                            <div className="text-sm text-night-500">Cash Balance</div>
                                            <div className="text-2xl font-bold">{formatCurrency(portfolio.cash)}</div>
                                        </div>
                                    </div>
                                    <div className="bg-night-700 p-4 rounded-lg flex items-center gap-4">
                                        <BriefcaseIcon className="h-8 w-8 text-night-100 opacity-50" />
                                        <div>
                                            <div className="text-sm text-night-500">Holdings Value</div>
                                            <div className="text-2xl font-bold">{formatCurrency(holdingsValue)}</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>
                    ) : (
                        <Card><p className="text-center text-night-500 p-4">Log in to view your Portfolio Overview.</p></Card>
                    )}

                    {user ? (
                        <Card>
                            <h2 className="text-2xl font-bold mb-4">My Stock Holdings</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="border-b border-night-600">
                                        <tr>
                                            <th className="p-3">Ticker</th>
                                            <th className="p-3">Shares</th>
                                            <th className="p-3">Avg. Price</th>
                                            <th className="p-3">Current Price</th>
                                            <th className="p-3">Total Value</th>
                                            <th className="p-3">Day's G/L</th>
                                            <th className="p-3">Open G/L</th>
                                            <th className="p-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {portfolio.holdings.length === 0 ? (
                                            <tr><td colSpan={8} className="text-center p-6 text-night-500">You do not own any stocks.</td></tr>
                                        ) : (
                                            portfolio.holdings.map(h => {
                                                // FIX START: Define the missing variables here
                                                const totalValue = h.shares * h.currentPrice;
                                                const openGain = (h.currentPrice - h.purchasePrice) * h.shares;
                                                const openGainPercent = h.purchasePrice > 0 ? (openGain / (h.purchasePrice * h.shares)) * 100 : 0;
                                                const dayGain = h.shares * (h.change || 0);
                                                const dayGainPercent = h.changesPercentage || 0;
                                                // FIX END
                                                return (
                                                    <tr key={h.ticker} className="border-b border-night-700 hover:bg-night-700">
                                                        <td className="p-3 font-bold"><Link to={`/stock/${h.ticker}`} className="text-brand-blue hover:underline">{h.ticker}</Link></td>
                                                        <td className="p-3">{h.shares.toFixed(3)}</td>
                                                        <td className="p-3">{formatCurrency(h.purchasePrice)}</td>
                                                        <td className="p-3">{formatCurrency(h.currentPrice)}</td>
                                                        <td className="p-3">{formatCurrency(totalValue)}</td>
                                                        <td className={`p-3 font-semibold ${dayGain >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                                                            {formatCurrency(dayGain)} ({formatPercentage(dayGainPercent)})
                                                        </td>
                                                        <td className={`p-3 font-semibold ${openGain >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                                                            {formatCurrency(openGain)} ({formatPercentage(openGainPercent)})
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <button 
                                                                onClick={() => sellAllStock(h.ticker)}
                                                                className="text-white bg-brand-red px-3 py-1 rounded-md text-sm hover:bg-red-600 transition-colors"
                                                            >
                                                                Sell All
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    ) : (
                         <Card><p className="text-center text-night-500 p-4">Log in to view your Stock Holdings.</p></Card>
                    )}

                    {user ? (
                        <Card>
                            <h2 className="text-2xl font-bold mb-4">My Option Holdings</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="border-b border-night-600">
                                        <tr>
                                            <th className="p-3">Ticker</th>
                                            <th className="p-3">Expiry</th>
                                            <th className="p-3">Strike Price</th>
                                            <th className="p-3">Contracts</th>
                                            <th className="p-3">Avg. Premium</th>
                                            <th className="p-3">Current Premium</th>
                                            <th className="p-3">Total Value</th>
                                            <th className="p-3">Day's G/L</th>
                                            <th className="p-3">Open G/L</th>
                                            <th className="p-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {portfolio.optionHoldings.length === 0 ? (
                                            <tr><td colSpan={10} className="text-center p-6 text-night-500">You do not own any options.</td></tr>
                                        ) : (
                                            portfolio.optionHoldings.map(o => {
                                                const totalValue = o.shares * o.currentPrice * 100;
                                                const openGain = (o.currentPrice - o.purchasePrice) * o.shares * 100;
                                                const openGainPercent = o.purchasePrice > 0 ? (openGain / (o.purchasePrice * o.shares * 100)) * 100 : 0;
                                                const dayGain = (o.change || 0) * o.shares * 100;
                                                const dayGainPercent = o.changesPercentage || 0;
                                                
                                                const handleSellClick = () => {
                                                    manualSellOption(o.symbol); 
                                                };

                                                return (
                                                    <tr key={o.symbol} className="border-b border-night-700 hover:bg-night-700">
                                                        <td className="p-3 font-bold">
                                                            <Link to={`/stock/${o.underlyingTicker}`} className="text-brand-blue hover:underline">{o.underlyingTicker}</Link>
                                                            <span className={`ml-2 text-xs font-semibold uppercase ${o.optionType === 'call' ? 'text-brand-green' : 'text-brand-red'}`}>({o.optionType})</span>
                                                        </td>
                                                        <td className="p-3 text-sm">{o.expirationDate}</td>
                                                        <td className="p-3">{formatCurrency(o.strikePrice)}</td>
                                                        <td className="p-3">{o.shares}</td>
                                                        <td className="p-3">{formatCurrency(o.purchasePrice)}</td>
                                                        <td className="p-3">{formatCurrency(o.currentPrice)}</td>
                                                        <td className="p-3">{formatCurrency(totalValue)}</td>
                                                        <td className={`p-3 font-semibold ${dayGain >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                                                            {formatCurrency(dayGain)} ({formatPercentage(dayGainPercent)})
                                                        </td>
                                                        <td className={`p-3 font-semibold ${openGain >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                                                            {formatCurrency(openGain)} ({formatPercentage(openGainPercent)})
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <button 
                                                                onClick={handleSellClick}
                                                                className="text-white bg-brand-red px-3 py-1 rounded-md text-sm hover:bg-red-600 transition-colors"
                                                            >
                                                                Sell All
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                    ) : (
                         <Card><p className="text-center text-night-500 p-4">Log in to view your Option Holdings.</p></Card>
                    )}

                    {import.meta.env.DEV && (
                        <ActiveUsers />
                    )}

                </div>
            </div>
            <div className="mt-8">
                <MarketScreener /> 
            </div>
        </div>
    );
};

export default Dashboard;