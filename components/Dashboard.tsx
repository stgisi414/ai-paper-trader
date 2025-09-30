import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../hooks/usePortfolio';
import * as fmpService from '../services/fmpService';
import * as geminiService from '../services/geminiService';
import type { FmpSearchResult, PortfolioRiskAnalysis } from '../types';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { SearchIcon, TrendingUpIcon, DollarSignIcon, BriefcaseIcon, BrainCircuitIcon } from './common/Icons';

const Dashboard: React.FC = () => {
    const { portfolio, totalValue, isLoading: isPortfolioLoading } = usePortfolio();
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<FmpSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchAttempted, setSearchAttempted] = useState(false);
    const [portfolioAnalysis, setPortfolioAnalysis] = useState<PortfolioRiskAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

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
            alert("Failed to search for stocks.");
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
            alert("The AI portfolio analysis could not be completed.");
        } finally {
            setIsAnalyzing(false);
        }
    }, [portfolio]);
    
    const holdingsValue = totalValue - portfolio.cash;
    const totalGain = totalValue - portfolio.initialValue;
    const totalGainPercent = portfolio.initialValue > 0 ? (totalGain / portfolio.initialValue) * 100 : 0;

    return (
        <div className="space-y-8">
            <div className="text-center">
                <h1 className="text-4xl font-bold">AI Paper Trader</h1>
                <p className="text-night-500 mt-2">Make smarter trades with the power of AI.</p>
            </div>
            
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

                {/* UI feedback for no results */}
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

            {/* AI Portfolio Risk Analysis */}
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
                        <h3 className="text-lg font-bold">Risk Level: <span className="text-brand-blue">{portfolioAnalysis.riskLevel}</span></h3>
                        <p className="text-night-100 mt-2">Highest Sector Concentration: <span className="font-bold">{portfolioAnalysis.concentration.highestSector} ({formatPercentage(portfolioAnalysis.concentration.percentage)})</span></p>
                        <h3 className="text-lg font-bold mt-4">Suggestions</h3>
                        <ul className="list-disc list-inside text-night-100">
                            {portfolioAnalysis.suggestions.map((item, index) => <li key={index}>{item}</li>)}
                        </ul>
                    </div>
                )}
            </Card>

            {/* Portfolio Summary */}
            <Card>
                <h2 className="text-2xl font-bold mb-4">Portfolio Overview</h2>
                {isPortfolioLoading ? <Spinner /> : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-night-700 p-4 rounded-lg flex items-center gap-4">
                            <BriefcaseIcon className="h-8 w-8 text-brand-blue" />
                            <div>
                                <div className="text-sm text-night-500">Total Value</div>
                                <div className="text-2xl font-bold">{formatCurrency(totalValue)}</div>
                            </div>
                        </div>
                        <div className="bg-night-700 p-4 rounded-lg flex items-center gap-4">
                            <TrendingUpIcon className={`h-8 w-8 ${totalGain >= 0 ? 'text-brand-green' : 'text-brand-red'}`} />
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

            {/* Holdings List */}
            <Card>
                <h2 className="text-2xl font-bold mb-4">My Holdings</h2>
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
        </div>
    );
};

export default Dashboard;