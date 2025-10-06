import React, { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useWatchlist } from '../hooks/useWatchlist';
import { usePortfolio } from '../hooks/usePortfolio';
import * as fmpService from '../services/fmpService';
import * as geminiService from '../services/geminiService';
import type { FmpSearchResult, CombinedRec, WatchlistPick, FmpHistoricalData, TechnicalAnalysis } from '../types';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { formatCurrency, formatPercentage, formatNumber } from '../utils/formatters';
import { EyeIcon, TrashIcon, PlusIcon, SearchIcon, GripVerticalIcon, LightbulbIcon, BrainCircuitIcon } from './common/Icons';

const getSmartRecForTicker = (ticker: string): CombinedRec | null => {
    try {
        const savedRec = localStorage.getItem(`combinedRec-${ticker}`);
        return savedRec ? JSON.parse(savedRec) : null;
    } catch {
        return null;
    }
};

const Watchlist: React.FC = () => {
    const { watchlist, addToWatchlist, removeFromWatchlist, reorderWatchlist, isLoading } = useWatchlist();
    const { portfolio } = usePortfolio();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<FmpSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isRecLoading, setIsRecLoading] = useState(false);
    const [individualRecLoading, setIndividualRecLoading] = useState<Set<string>>(new Set());
    const [recError, setRecError] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<WatchlistPick[]>([]);
    const [localRecsVersion, setLocalRecsVersion] = useState(0);

    // Refs for drag and drop
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleSearch = useCallback(async (query: string) => {
        setSearchQuery(query);
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const results = await fmpService.searchStocks(query);
            setSearchResults(results.slice(0, 5));
        } catch (error) {
            console.error("Search failed:", error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    }, []);

    const handleAdd = (stock: FmpSearchResult) => {
        addToWatchlist(stock.symbol, stock.name);
        setSearchQuery('');
        setSearchResults([]);
        setIsSearchOpen(false);
    };

    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null) {
            reorderWatchlist(dragItem.current, dragOverItem.current);
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };
    
    const handleSmartRecs = useCallback(async () => {
        setIsRecLoading(true);
        setRecError(null);
        setRecommendations([]);
        try {
            const generalNews = await fmpService.getGeneralNews(15);
            const newsSummary = generalNews.map(n => n.title).join('. ');

            const holdings = portfolio.holdings.map(h => ({ ticker: h.ticker, shares: h.shares }));
            const watchlistTickers = watchlist.map(w => w.ticker);
            const result = await geminiService.getWatchlistPicks(holdings, watchlistTickers, newsSummary);
            setRecommendations(result.picks);
        } catch (error) {
            console.error("Smart Picker failed:", error);
            setRecError("Could not generate recommendations at this time.");
        } finally {
            setIsRecLoading(false);
        }
    }, [portfolio.holdings, watchlist]);

    const handleGenerateRec = useCallback(async (ticker: string) => {
        setIndividualRecLoading(prev => new Set(prev).add(ticker));
        setRecError(null);
        
        try {
            // 1. Fetch necessary data in parallel
            const [profileData, ratingsData, historyData] = await Promise.all([
                fmpService.getProfile(ticker).then(res => res[0] || null),
                fmpService.getAnalystRatings(ticker).then(res => res || []),
                fmpService.getHistoricalData(ticker, '1day'),
            ]);

            const historical = (historyData.historical as FmpHistoricalData[]).reverse();
            
            if (!profileData || ratingsData.length === 0 || historical.length === 0) {
                 throw new Error("Missing required data for analysis.");
            }

            // 2. Generate Technical Analysis first (required for combined rec)
            const technicals: TechnicalAnalysis = await geminiService.getTechnicalAnalysis(historical);

            // 3. Get Combined Recommendation
            const recommendation: CombinedRec = await geminiService.getCombinedRecommendations(
                profileData, 
                ratingsData, 
                technicals
            );

            // 4. Save the recommendation to localStorage (same mechanism as StockView)
            localStorage.setItem(`combinedRec-${ticker}`, JSON.stringify(recommendation));
            setLocalRecsVersion(prev => prev + 1);

        } catch (error) {
            console.error(`AI Recommendation failed for ${ticker}:`, error);
            alert(`The AI recommendation for ${ticker} could not be completed.`);
        } finally {
            setIndividualRecLoading(prev => {
                const newSet = new Set(prev);
                newSet.delete(ticker);
                return newSet;
            });
        }
    }, []);

    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <EyeIcon className="h-6 w-6 text-brand-blue" /> My Watchlist
                </h2>
                <div className="flex items-center gap-2">
                     <button onClick={handleSmartRecs} disabled={isRecLoading} className="text-night-100 hover:text-yellow-400" title="Get AI Recommendations">
                        <LightbulbIcon className="h-6 w-6" />
                    </button>
                    <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="text-night-100 hover:text-brand-blue" title="Add to Watchlist">
                        <PlusIcon className="h-6 w-6" />
                    </button>
                </div>
            </div>
            {isSearchOpen && (
                <div className="relative mb-4">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-night-100" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Add ticker to watchlist..."
                        className="w-full bg-night-700 border border-night-600 rounded-md py-2 pl-10 pr-4 focus:ring-2 focus:ring-brand-blue focus:outline-none"
                    />
                    {isSearching && <Spinner />}
                    {searchResults.length > 0 && (
                        <ul className="absolute z-10 w-full bg-night-600 mt-1 rounded-md shadow-lg">
                            {searchResults.map((stock) => (
                                <li key={stock.symbol} onClick={() => handleAdd(stock)} className="px-4 py-2 hover:bg-night-500 cursor-pointer">
                                    <span className="font-bold">{stock.symbol}</span> - {stock.name}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
            
            {isRecLoading && <Spinner />}
            {recError && <p className="text-sm text-brand-red text-center mb-2">{recError}</p>}
            {recommendations.length > 0 && (
                <div className="mb-4 p-4 bg-night-700 rounded-lg space-y-3">
                    <h3 className="font-bold text-yellow-400">AI Suggestions</h3>
                    {recommendations.map(rec => (
                        <div key={rec.symbol} className="text-sm">
                            <div className="flex justify-between items-center">
                                <span className="font-bold">{rec.symbol} - {rec.name}</span>
                                <button onClick={() => addToWatchlist(rec.symbol, rec.name)} className="text-xs bg-brand-blue text-white px-2 py-1 rounded-md hover:bg-blue-600">+</button>
                            </div>
                            <p className="text-night-100 italic">"{rec.reason}"</p>
                        </div>
                    ))}
                </div>
            )}

            {isLoading && watchlist.length === 0 ? <Spinner /> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b border-night-600">
                            <tr>
                                <th className="p-3 w-8"></th>
                                <th className="p-3">Ticker</th>
                                <th className="p-3">Price</th>
                                <th className="p-3">Change</th>
                                <th className="p-3">AI Rec</th>
                                <th className="p-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {watchlist.length === 0 ? (
                                <tr><td colSpan={6} className="text-center p-6 text-night-500">Your watchlist is empty.</td></tr>
                            ) : (
                                watchlist.map((item, index) => {
                                    const priceChangeColor = item.change >= 0 ? 'text-brand-green' : 'text-brand-red';
                                    const smartRec = getSmartRecForTicker(item.ticker);
                                    const isGeneratingRec = individualRecLoading.has(item.ticker); // NEW: Check loading status
                                    
                                    return (
                                        <tr 
                                            key={item.ticker} 
                                            className="border-b border-night-700 hover:bg-night-700"
                                            draggable
                                            onDragStart={() => dragItem.current = index}
                                            onDragEnter={() => dragOverItem.current = index}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={(e) => e.preventDefault()}
                                        >
                                            <td className="p-3 text-night-500 cursor-grab">
                                                <GripVerticalIcon className="h-5 w-5" />
                                            </td>
                                            <td className="p-3 font-bold">
                                                <Link to={`/stock/${item.ticker}`} className="text-brand-blue hover:underline">{item.ticker}</Link>
                                            </td>
                                            <td className="p-3 font-semibold">{formatCurrency(item.price)}</td>
                                            <td className={`p-3 font-semibold ${priceChangeColor}`}>
                                                {formatCurrency(item.change)} ({formatPercentage(item.changesPercentage)})
                                            </td>
                                            <td className="p-3 text-xs">
                                                {isGeneratingRec ? ( // NEW: Show spinner if generating
                                                    <div className="flex justify-start"><Spinner /></div>
                                                ) : smartRec ? (
                                                    <div className={`font-bold ${smartRec.sentiment === 'BULLISH' ? 'text-brand-green' : smartRec.sentiment === 'BEARISH' ? 'text-brand-red' : ''}`}>
                                                        {smartRec.sentiment}: <span className="text-yellow-400">{smartRec.strategy.split('(')[0].trim()}</span>                                                    </div>
                                                ) : (
                                                     <button // MODIFICATION: Replace N/A with button
                                                        onClick={() => handleGenerateRec(item.ticker)}
                                                        className="text-brand-blue hover:text-yellow-400 disabled:opacity-50"
                                                        disabled={isGeneratingRec}
                                                        title="Generate AI Recommendation"
                                                    >
                                                        <BrainCircuitIcon className="h-5 w-5" />
                                                    </button>
                                                )}
                                            </td>
                                            <td className="p-3 text-right">
                                                <button onClick={() => removeFromWatchlist(item.ticker)} className="text-night-500 hover:text-brand-red">
                                                    <TrashIcon className="h-5 w-5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </Card>
    );
};

export default Watchlist;