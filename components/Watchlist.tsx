import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWatchlist } from '../hooks/useWatchlist';
import { usePortfolio } from '../hooks/usePortfolio';
import * as fmpService from '../services/fmpService';
import * as geminiService from '../services/geminiService';
import type { FmpSearchResult, CombinedRec, WatchlistPick, FmpHistoricalData, TechnicalAnalysis, QuestionnaireAnswers } from '../types';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { formatCurrency, formatPercentage, formatNumber } from '../utils/formatters';
import { EyeIcon, TrashIcon, PlusIcon, SearchIcon, GripVerticalIcon, LightbulbIcon, BrainCircuitIcon, SaveIcon, FilterIcon, NewspaperIcon, RegenerateIcon, SettingsIcon, EditIcon } from './common/Icons';
import WatchlistNews from './WatchlistNews';

const sectors = ["Technology", "Healthcare", "Financial Services", "Consumer Cyclical", "Industrials", "Energy", "Real Estate", "Utilities", "Basic Materials"];

// New Manage Watchlists Modal Component
const ManageWatchlistsModal: React.FC<{
    allWatchlists: any[];
    reorderWatchlists: (startIndex: number, endIndex: number) => void;
    renameWatchlist: (oldName: string, newName: string) => void;
    deleteWatchlist: (name: string) => void;
    onClose: () => void;
}> = ({ allWatchlists, reorderWatchlists, renameWatchlist, deleteWatchlist, onClose }) => {
    const [editingName, setEditingName] = useState<string | null>(null);
    const [newName, setNewName] = useState('');
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleRename = (oldName: string) => {
        if (newName.trim()) {
            renameWatchlist(oldName, newName);
        }
        setEditingName(null);
        setNewName('');
    };
    
    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null) {
            reorderWatchlists(dragItem.current, dragOverItem.current);
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    return (
        <div className="fixed inset-0 bg-night-900 bg-opacity-80 flex justify-center items-center z-50 p-4">
            <div className="bg-night-800 rounded-lg shadow-2xl w-full max-w-md">
                <div className="flex justify-between items-center p-4 border-b border-night-700">
                    <h2 className="text-xl font-bold">Manage Watchlists</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-night-500 hover:bg-night-600 hover:text-white">&times;</button>
                </div>
                <div className="p-4">
                    <p className="text-sm text-night-500 mb-4">Drag to reorder. Click the pencil to rename.</p>
                    <ul className="space-y-2">
                        {allWatchlists.map((wl, index) => (
                            <li
                                key={wl.name}
                                draggable
                                onDragStart={() => dragItem.current = index}
                                onDragEnter={() => dragOverItem.current = index}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                                className="flex items-center justify-between p-2 bg-night-700 rounded-md cursor-grab"
                            >
                                <div className="flex items-center gap-2">
                                    <GripVerticalIcon className="h-5 w-5 text-night-500" />
                                    {editingName === wl.name ? (
                                        <input
                                            type="text"
                                            value={newName}
                                            onChange={(e) => setNewName(e.target.value)}
                                            onBlur={() => handleRename(wl.name)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleRename(wl.name);
                                                if (e.key === 'Escape') {
                                                    setEditingName(null);
                                                    setNewName('');
                                                }
                                            }}
                                            className="bg-night-600 text-white p-1 rounded"
                                            autoFocus
                                        />
                                    ) : (
                                        <span>{wl.name}</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => { setEditingName(wl.name); setNewName(wl.name); }} className="text-night-500 hover:text-yellow-400">
                                        <EditIcon className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => deleteWatchlist(wl.name)} className="text-night-500 hover:text-brand-red">
                                        <TrashIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

const Watchlist: React.FC = () => {
    const {
        watchlist, addToWatchlist, removeFromWatchlist, reorderWatchlistItems, isLoading,
        allWatchlists, activeWatchlist, setActiveWatchlist, createNewWatchlist,
        deleteWatchlist, renameWatchlist, reorderWatchlists
    } = useWatchlist();
    
    const { portfolio } = usePortfolio();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<FmpSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isRecLoading, setIsRecLoading] = useState(false);
    const [individualRecLoading, setIndividualRecLoading] = useState<Set<string>>(new Set());
    const [recError, setRecError] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<WatchlistPick[]>([]);
    const [localRecs, setLocalRecs] = useState<Record<string, CombinedRec>>({});
    const [newWatchlistName, setNewWatchlistName] = useState('');
    const [showNewWatchlistInput, setShowNewWatchlistInput] = useState(false);
    const [showFilters, setShowFilters] = useState(false);
    const [sectorFilter, setSectorFilter] = useState<string | null>(null);
    const [showWatchlistNews, setShowWatchlistNews] = useState(false);
    const [isManageModalOpen, setIsManageModalOpen] = useState(false);

    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const filteredWatchlist = useMemo(() => {
        if (!sectorFilter) return watchlist;
        return watchlist.filter(item => item.sector === sectorFilter);
    }, [watchlist, sectorFilter]);

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
    
    const handleSaveNewWatchlist = async () => {
        if (newWatchlistName.trim()) {
            await createNewWatchlist(newWatchlistName.trim());
            setNewWatchlistName('');
            setShowNewWatchlistInput(false);
        }
    };

    const handleDragEnd = () => {
        if (dragItem.current !== null && dragOverItem.current !== null) {
            reorderWatchlistItems(dragItem.current, dragOverItem.current);
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
        
        // FIX: Explicitly clear the old recommendation *before* fetching the new one.
        // This prevents the stale data bug if the API call fails.
        setLocalRecs(prev => {
            const newState = { ...prev };
            delete newState[ticker];
            return newState;
        });
        
        try {
            const [profileData, ratingsData, historyData] = await Promise.all([
                fmpService.getProfile(ticker).then(res => res[0] || null),
                fmpService.getAnalystRatings(ticker).then(res => res || []),
                fmpService.getHistoricalData(ticker, '1day'),
            ]);

            const historical = (historyData?.historical as FmpHistoricalData[])?.reverse() || [];
            
            if (!profileData || historical.length === 0) {
                 throw new Error("Missing essential profile or historical data for analysis.");
            }

            const technicals: TechnicalAnalysis = await geminiService.getTechnicalAnalysis(historical);
            const recommendation: CombinedRec = await geminiService.getCombinedRecommendations(
                profileData, 
                ratingsData,
                technicals
            );

            // Update state with the new, correct recommendation. It will be saved automatically.
            setLocalRecs(prev => ({ ...prev, [ticker]: recommendation }));

        } catch (error) {
            console.error(`AI Recommendation failed for ${ticker}:`, error);
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            alert(`The AI recommendation for ${ticker} could not be completed. Reason: ${errorMessage}`);
        } finally {
            setIndividualRecLoading(prev => {
                const newSet = new Set(prev);
                newSet.delete(ticker);
                return newSet;
            });
        }
    }, []);

    return (
        <>
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-2">
                        <EyeIcon className="h-6 w-6 text-brand-blue" />
                        <select
                            value={activeWatchlist}
                            onChange={(e) => {
                                setActiveWatchlist(e.target.value);
                                setSectorFilter(null);
                            }}
                            className="bg-night-700 border border-night-600 rounded-md py-1 px-2 focus:ring-2 focus:ring-brand-blue focus:outline-none text-lg font-bold"
                        >
                            {allWatchlists.map(wl => (
                                <option key={wl.name} value={wl.name}>{wl.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 relative">
                        <button onClick={() => setIsManageModalOpen(true)} className="text-night-100 hover:text-gray-400" title="Manage Watchlists">
                            <SettingsIcon className="h-6 w-6" />
                        </button>
                        <button onClick={() => setShowWatchlistNews(true)} className="text-night-100 hover:text-blue-400" title="Get Watchlist News">
                            <NewspaperIcon className="h-6 w-6" />
                        </button>
                        <button onClick={handleSmartRecs} disabled={isRecLoading} className="text-night-100 hover:text-yellow-400" title="Get AI Recommendations">
                            <LightbulbIcon className="h-6 w-6" />
                        </button>
                        <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="text-night-100 hover:text-brand-blue" title="Add to Watchlist">
                            <PlusIcon className="h-6 w-6" />
                        </button>
                        <button onClick={() => setShowNewWatchlistInput(!showNewWatchlistInput)} className="text-night-100 hover:text-brand-green" title="Create New Watchlist">
                            <SaveIcon className="h-6 w-6" />
                        </button>
                        <button onClick={() => setShowFilters(!showFilters)} className="text-night-100 hover:text-purple-400" title="Filter by Sector">
                            <FilterIcon className="h-6 w-6" />
                        </button>

                        {showFilters && (
                            <div className="absolute top-full right-0 mt-2 bg-night-600 p-2 rounded-md shadow-lg z-10 w-48">
                                <ul className="space-y-1">
                                    {sectorFilter && ( 
                                        <li><button onClick={() => { setSectorFilter(null); setShowFilters(false); }} className="w-full text-left px-3 py-2 text-sm rounded-md text-red-400 hover:bg-night-500">Clear Filter</button></li>
                                    )}
                                    {sectors.map(sector => (
                                        <li key={sector}><button onClick={() => { setSectorFilter(sector); setShowFilters(false); }} className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-night-500">{sector}</button></li>
                                    ))}
                                </ul>
                            </div>
                        )}
                         {showNewWatchlistInput && (
                            <div className="absolute top-full right-0 mt-2 bg-night-600 p-2 rounded-md shadow-lg z-10 w-48">
                                <input
                                    type="text"
                                    value={newWatchlistName}
                                    onChange={(e) => setNewWatchlistName(e.target.value)}
                                    placeholder="New watchlist name..."
                                    className="w-full bg-night-700 border border-night-500 rounded-md py-1 px-2 text-sm mb-2"
                                />
                                <button
                                    onClick={handleSaveNewWatchlist}
                                    className="w-full bg-brand-blue text-white font-bold py-1 rounded-md text-sm hover:bg-blue-600"
                                >
                                    Save
                                </button>
                            </div>
                        )}
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
                        {recommendations.map((rec, index) => ( // <-- ADD 'index' argument here
                            <div key={rec.symbol || index} className="text-sm">
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
                         {sectorFilter && (
                            <div className="p-2 text-sm text-center bg-night-700 rounded-md mb-2">
                                Filtering by: <span className="font-bold text-purple-400">{sectorFilter}</span>
                            </div>
                        )}
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
                                {filteredWatchlist.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center p-6 text-night-500">{sectorFilter ? `No stocks in this watchlist match the filter.` : `Your watchlist is empty.`}</td></tr>
                                ) : (
                                    filteredWatchlist.map((item, index) => {
                                        const priceChangeColor = item.change >= 0 ? 'text-brand-green' : 'text-brand-red';
                                        const smartRec = localRecs[item.ticker]; // FIX: Read from local state
                                        const isGeneratingRec = individualRecLoading.has(item.ticker);
                                        
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
                                                    <div className="flex items-center gap-2">
                                                        {isGeneratingRec ? (
                                                            <div className="flex justify-start"><Spinner /></div>
                                                        ) : smartRec ? (
                                                            <div className={`font-bold ${smartRec.sentiment === 'BULLISH' ? 'text-brand-green' : smartRec.sentiment === 'BEARISH' ? 'text-brand-red' : ''}`}>
                                                                {smartRec.sentiment}: <span className="text-yellow-400">{smartRec.strategy.split('(')[0].trim()}</span>
                                                            </div>
                                                        ) : (
                                                            <button onClick={() => handleGenerateRec(item.ticker)} className="text-brand-blue hover:text-yellow-400" title="Generate AI Recommendation">
                                                                <BrainCircuitIcon className="h-5 w-5" />
                                                            </button>
                                                        )}
                                                        {/* FIX: Add Regenerate Button */}
                                                        {smartRec && !isGeneratingRec && (
                                                            <button onClick={() => handleGenerateRec(item.ticker)} className="text-night-500 hover:text-yellow-400" title="Regenerate Recommendation">
                                                                <RegenerateIcon className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
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

            {showWatchlistNews && (
                <WatchlistNews 
                    tickers={watchlist.map(item => item.ticker)} 
                    onClose={() => setShowWatchlistNews(false)} 
                    cashOnHand={portfolio.cash}
                />
            )}
            
            {isManageModalOpen && (
                <ManageWatchlistsModal
                    allWatchlists={allWatchlists}
                    reorderWatchlists={reorderWatchlists}
                    renameWatchlist={renameWatchlist}
                    deleteWatchlist={deleteWatchlist}
                    onClose={() => setIsManageModalOpen(false)}
                />
            )}
        </>
    );
};

export default Watchlist;