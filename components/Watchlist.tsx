import React from 'react';
import { Link } from 'react-router-dom';
import { useWatchlist } from '../hooks/useWatchlist';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { formatCurrency, formatPercentage } from '../utils/formatters';
import { EyeIcon, TrashIcon } from './common/Icons';

const Watchlist: React.FC = () => {
    const { watchlist, removeFromWatchlist, isLoading } = useWatchlist();

    return (
        <Card>
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                <EyeIcon className="h-6 w-6 text-brand-blue" /> My Watchlist
            </h2>
            {isLoading && watchlist.length === 0 ? <Spinner /> : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="border-b border-night-600">
                            <tr>
                                <th className="p-3">Ticker</th>
                                <th className="p-3">Price</th>
                                <th className="p-3">Change</th>
                                <th className="p-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {watchlist.length === 0 ? (
                                <tr><td colSpan={4} className="text-center p-6 text-night-500">Your watchlist is empty.</td></tr>
                            ) : (
                                watchlist.map(item => {
                                    const priceChangeColor = item.change >= 0 ? 'text-brand-green' : 'text-brand-red';
                                    return (
                                        <tr key={item.ticker} className="border-b border-night-700 hover:bg-night-700">
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