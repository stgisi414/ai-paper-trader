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
import { useAuth } from '../src/hooks/useAuth.tsx';

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    // MODIFIED: Destructure manualSellOption
    const { portfolio, totalValue, isLoading: isPortfolioLoading, manualSellOption } = usePortfolio();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<FmpSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchAttempted, setSearchAttempted] = useState(false);
    const [portfolioAnalysis, setPortfolioAnalysis] = useState<PortfolioRiskAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [testResult, setTestResult] = useState<string>('');
    const [isTesting, setIsTesting] = useState(false);

    const handleProxyTest = useCallback(async () => {
        setIsTesting(true);
        setTestResult('');
        try {
            const result = await geminiService.testGeminiProxy();
            console.log("Gemini Proxy Test successful:", result);
            setTestResult(`Success: ${result.message}`);
        } catch (error) {
            console.error("Gemini Proxy Test failed:", error);
            setTestResult(`Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
            // Replace alert with console.error or custom modal
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
            // Replace alert with console.error or custom modal
            console.error("The AI portfolio analysis could not be completed.");
        } finally {
            setIsAnalyzing(false);
        }
    }, [portfolio]);
    
    const holdingsValue = totalValue - portfolio.cash;
    const totalGain = totalValue - portfolio.initialValue;
    const totalGainPercent = portfolio.initialValue > 0 ? (totalGain / portfolio.initialValue) * 100 : 0;
    const GainLossIcon = totalGain >= 0 ? TrendingUpIcon : TrendingDownIcon;

    return (
        <div>
            {user && <ChatPanel />} {/* MODIFIED: Only show SignatexFlow if logged in */}
            <div className="text-center">
                <h1 className="text-4xl font-bold">Signatex.co</h1>
                <p className="text-night-500 mt-2">Make smarter trades with the power of AI.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
                <div className="lg:col-span-1">
                    {/* MODIFIED: Conditionally render Watchlist or a login prompt */}
                    {user ? <Watchlist /> : <Card><p className="text-center text-night-500 p-4">Log in to view your Watchlist.</p></Card>}
                </div>
                <div className="lg:col-span-2 space-y-8">
                    {/* Search Bar */}
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

                    {user && (
                        <Card>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold">Gemini Proxy Test</h2>
                                <button onClick={handleProxyTest} disabled={isTesting} className="bg-purple-600 text-white font-bold py-2 px-4 rounded-md hover:bg-purple-700 transition-colors disabled:bg-night-600">
                                    {isTesting ? 'Testing...' : 'Run Test'}
                                </button>
                            </div>
                            {isTesting && <Spinner />}
                            {testResult && (
                                <div className={`mt-4 p-2 rounded-md ${testResult.startsWith('Failed') ? 'bg-red-900' : 'bg-green-900'}`}>
                                    <pre className="text-xs whitespace-pre-wrap">{testResult}</pre>
                                </div>
                            )}
                        </Card>
                    )}

                    {/* MODIFIED: Portfolio Risk Analysis - now conditional */}
                    {user ? (
                        <Card>
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold flex items-center gap-2"><BrainCircuitIcon className="h-6 w-6 text-brand-blue" /> AI Portfolio Risk Analysis</h2>
                                <button onClick={handlePortfolioAnalysis} disabled={isAnalyzing} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600">
                                    {isAnalyzing ? 'Analyzing...' : 'Run Risk Analysis'}
                                </button>
                            </div>
                            {isAnalyzing && <Spinner />}
                            {portfolioAnalysis && (
                                <div className="bg-night-700 p-4 rounded-lg">
                                    {/* Use nullish coalescing to safely display riskLevel */}
                                    <h3 className="text-lg font-bold">Risk Level: <span className="text-brand-blue">{portfolioAnalysis.riskLevel ?? 'N/A'}</span></h3>
                                    
                                    {/* CRITICAL: Use optional chaining (?. ) for nested concentration properties */}
                                    <p className="text-night-100 mt-2">
                                        Highest Sector Concentration: <span className="font-bold">
                                            {portfolioAnalysis.concentration?.highestSector ?? 'N/A'} 
                                            ({formatPercentage(portfolioAnalysis.concentration?.percentage)})
                                        </span>
                                    </p>
                                    
                                    <h3 className="text-lg font-bold mt-4">Suggestions</h3>
                                    <ul className="list-disc list-inside text-night-100">
                                        {/* CRITICAL: Use optional chaining before calling .map() */}
                                        {portfolioAnalysis.suggestions?.map((item, index) => <li key={index}>{item}</li>) ?? <li>No specific suggestions provided by AI.</li>}
                                    </ul>
                                </div>
                            )}
                        </Card>
                    ) : (
                        <Card><p className="text-center text-night-500 p-4">Log in to run AI Portfolio Risk Analysis.</p></Card>
                    )}

                    {/* MODIFIED: Portfolio Overview - now conditional */}
                    {user ? (
                        <Card>
                            <h2 className="text-2xl font-bold mb-4">Portfolio Overview</h2>
                            {isPortfolioLoading ? <Spinner /> : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> 
                                    <div className="bg-night-700 p-4 rounded-lg flex items-center gap-4">
                                        <BriefcaseIcon className="h-8 w-8 text-brand-blue" />
                                        <div>
                                            <div className="text-sm text-night-500">Total Value</div>
                                            <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
                                        </div>
                                    </div>
                                    <div className="bg-night-700 p-4 rounded-lg flex items-center gap-4">
                                        <GainLossIcon className={`h-8 w-8 ${totalGain >= 0 ? 'text-brand-green' : 'text-brand-red'}`} />
                                        <div>
                                            <div className="text-sm text-night-500">Total Gain / Loss</div>
                                            <div className={`text-2xl font-bold ${totalGain >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                                                {formatCurrency(totalGain)} ({formatPercentage(totalGainPercent)})
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

                    {/* MODIFIED: Stock Holdings - now conditional */}
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
                                            <th className="p-3">Day's Gain/Loss</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {portfolio.holdings.length === 0 ? (
                                            <tr><td colSpan={6} className="text-center p-6 text-night-500">You do not own any stocks.</td></tr>
                                        ) : (
                                            portfolio.holdings.map(h => {
                                                const totalValue = h.shares * h.currentPrice;
                                                const gain = (h.currentPrice - h.purchasePrice) * h.shares;
                                                const gainPercent = (gain / (h.purchasePrice * h.shares)) * 100;
                                                return (
                                                    <tr key={h.ticker} className="border-b border-night-700 hover:bg-night-700">
                                                        <td className="p-3 font-bold"><Link to={`/stock/${h.ticker}`} className="text-brand-blue hover:underline">{h.ticker}</Link></td>
                                                        <td className="p-3">{h.shares}</td>
                                                        <td className="p-3">{formatCurrency(h.purchasePrice)}</td>
                                                        <td className="p-3">{formatCurrency(h.currentPrice)}</td>
                                                        <td className="p-3">{formatCurrency(totalValue)}</td>
                                                        <td className={`p-3 font-semibold ${gain >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                                                            {formatCurrency(gain)} ({formatPercentage(gainPercent)})
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

                    {/* MODIFIED: Option Holdings Table - now conditional */}
                    {user ? (
                        <Card>
                            <h2 className="text-2xl font-bold mb-4">My Option Holdings</h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="border-b border-night-600">
                                        <tr>
                                            <th className="p-3">Symbol</th>
                                            <th className="p-3">Contracts</th>
                                            <th className="p-3">Avg. Premium</th>
                                            <th className="p-3">Current Premium</th>
                                            <th className="p-3">Total Value</th>
                                            <th className="p-3">Gain/Loss</th>
                                            {/* ADDITION: Expiry Date Column */}
                                            <th className="p-3">Expiry</th>
                                            {/* MODIFICATION: Action Column */}
                                            <th className="p-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {portfolio.optionHoldings.length === 0 ? (
                                            <tr><td colSpan={8} className="text-center p-6 text-night-500">You do not own any options.</td></tr>
                                        ) : (
                                            portfolio.optionHoldings.map(o => {
                                                const totalValue = o.shares * o.currentPrice * 100;
                                                const gain = (o.currentPrice - o.purchasePrice) * o.shares * 100;
                                                const gainPercent = o.purchasePrice > 0 ? (gain / (o.purchasePrice * o.shares * 100)) * 100 : 0;
                                                
                                                // EXTENSIVE DEBUG LOGGING - Keep for now
                                                console.log(`[DASHBOARD RENDER - OPTION ${o.symbol}]`);
                                                console.log(`  - Contracts: ${o.shares}`);
                                                console.log(`  - Purchase Price (o.purchasePrice): ${o.purchasePrice}`);
                                                console.log(`  - Current Price (o.currentPrice): ${o.currentPrice}`);
                                                console.log(`  - Calculated Gain (Total): ${gain}`);
                                                console.log(`  - Calculated Gain (%): ${gainPercent}`);
                                                // END DEBUG LOGGING
                                                
                                                const handleSellClick = () => {
                                                    // Sells ALL contracts for the symbol using the manualSellOption wrapper
                                                    manualSellOption(o.symbol); 
                                                };

                                                return (
                                                    <tr key={o.symbol} className="border-b border-night-700 hover:bg-night-700">
                                                        <td className="p-3 font-bold">
                                                            <Link to={`/stock/${o.underlyingTicker}`} className="text-brand-blue hover:underline">{o.symbol}</Link>
                                                            {/* ADDITION: Display the option type and use color coding */}
                                                            <span className={`ml-2 text-xs font-semibold uppercase ${o.optionType === 'call' ? 'text-brand-green' : 'text-brand-red'}`}>({o.optionType})</span>
                                                        </td>
                                                        <td className="p-3">{o.shares}</td>
                                                        <td className="p-3">{formatCurrency(o.purchasePrice)}</td>
                                                        <td className="p-3">{formatCurrency(o.currentPrice)}</td>
                                                        <td className="p-3">{formatCurrency(totalValue)}</td>
                                                        <td className={`p-3 font-semibold ${gain >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                                                            {formatCurrency(gain)} ({formatPercentage(gainPercent)})
                                                        </td>
                                                        {/* ADDITION: Expiry Date */}
                                                        <td className="p-3 text-sm">{o.expirationDate}</td>
                                                        {/* MODIFICATION: Sell Button */}
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
                </div>
            </div>
            <div className="mt-8">
                <MarketScreener /> 
            </div>
        </div>
    );
};

export default Dashboard;
