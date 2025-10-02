import React, { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useWatchlist } from '../hooks/useWatchlist';
import * as fmpService from '../services/fmpService';
import type { FmpSearchResult } from '../types';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { EyeIcon, TrashIcon, PlusIcon, SearchIcon, GripVerticalIcon } from './common/Icons';

const Watchlist: React.FC = () => {
    const { watchlist, addToWatchlist, removeFromWatchlist, reorderWatchlist, isLoading } = useWatchlist();
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<FmpSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

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

    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                    <EyeIcon className="h-6 w-6 text-brand-blue" /> My Watchlist
                </h2>
                <button onClick={() => setIsSearchOpen(!isSearchOpen)} className="text-night-500 hover:text-brand-blue">
                    <PlusIcon className="h-6 w-6" />
                </button>
            </div>
            {isSearchOpen && (
                <div className="relative mb-4">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-night-500" />
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
            {isLoading && watchlist.length === 0 ? <Spinner /> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b border-night-600">
                            <tr>
                                <th className="p-3 w-8"></th>
                                <th className="p-3">Ticker</th>
                                <th className="p-3">Price</th>
                                <th className="p-3">Change</th>
                                <th className="p-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {watchlist.length === 0 ? (
                                <tr><td colSpan={5} className="text-center p-6 text-night-500">Your watchlist is empty.</td></tr>
                            ) : (
                                watchlist.map((item, index) => {
                                    const priceChangeColor = item.change >= 0 ? 'text-brand-green' : 'text-brand-red';
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
                                            <td className={`p-3 font-semibold ${priceChangeColor}`}>{formatCurrency(item.price)}</td>
                                            <td className={`p-3 font-semibold ${priceChangeColor}`}>
                                                {formatCurrency(item.change)} ({formatPercentage(item.changesPercentage)})
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