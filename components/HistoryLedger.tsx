import React, { useMemo } from 'react';
import { usePortfolio } from '../hooks/usePortfolio';
import Card from './common/Card';
import { formatCurrency } from '../utils/formatters';
import { BriefcaseIcon } from './common/Icons';
import ChatPanel from './ChatPanel';
import { useAuth } from '../src/hooks/useAuth.tsx';

const HistoryLedger: React.FC = () => {
    const { transactions } = usePortfolio();
    const { user } = useAuth();

    // ADDITION: Robust check against unprotected access (even though route is protected)
    if (!user) { 
        return <div className="text-center text-night-500 mt-10">You must be logged in to view your transaction history.</div>;
    }
    
    const realizedPnl = useMemo(() => {
        return transactions.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
    }, [transactions]);
    
    // Sort transactions by timestamp descending (most recent first)
    const sortedTransactions = useMemo(() => {
        return [...transactions].sort((a, b) => b.timestamp - a.timestamp);
    }, [transactions]);

    const getTypeColor = (type: string, pnl?: number) => {
        if (type.includes('BUY')) return 'text-brand-blue';
        if (type.includes('SELL')) {
            if (pnl !== undefined) {
                return pnl >= 0 ? 'text-brand-green' : 'text-brand-red';
            }
            return 'text-brand-red';
        }
        return 'text-night-100';
    };
    
    const formatPriceOrPnl = (value: number | undefined) => {
        if (value === undefined) return 'N/A';
        return formatCurrency(value);
    };


    return (
        <>
            <ChatPanel />
            <Card>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                        <BriefcaseIcon className="h-6 w-6 text-brand-blue" /> Transaction History
                    </h2>
                    <div className="text-right">
                        <div className="text-sm text-night-500">Total Realized P&L (Closed Positions)</div>
                        <div className={`text-xl font-bold ${realizedPnl >= 0 ? 'text-brand-green' : 'text-brand-red'}`}>
                            {formatPriceOrPnl(realizedPnl)}
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="min-w-full text-left divide-y divide-night-700">
                        <thead className="bg-night-700">
                            <tr>
                                <th className="p-3 text-sm font-semibold">Time</th>
                                <th className="p-3 text-sm font-semibold">Type</th>
                                <th className="p-3 text-sm font-semibold">Ticker/Option</th>
                                <th className="p-3 text-sm font-semibold">Shares/Contracts</th>
                                <th className="p-3 text-sm font-semibold">Price</th>
                                <th className="p-3 text-sm font-semibold">Total Amount</th>
                                <th className="p-3 text-sm font-semibold text-right">Realized P&L</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-night-700">
                            {sortedTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center p-6 text-night-500">No transactions recorded yet.</td>
                                </tr>
                            ) : (
                                sortedTransactions.map(t => (
                                    <tr key={t.id} className="hover:bg-night-700">
                                        <td className="p-3 text-xs text-night-500">{new Date(t.timestamp).toLocaleString()}</td>
                                        <td className={`p-3 font-semibold ${getTypeColor(t.type, t.realizedPnl)}`}>{t.type.replace('_', ' ')}</td>
                                        <td className="p-3 font-bold">{t.optionSymbol || t.ticker}</td>
                                        <td className="p-3">{t.shares}</td>
                                        <td className="p-3">{formatPriceOrPnl(t.price)}</td>
                                        <td className="p-3">{formatPriceOrPnl(t.totalAmount)}</td>
                                        <td className={`p-3 font-bold text-right ${getTypeColor(t.type, t.realizedPnl)}`}>
                                            {t.realizedPnl !== undefined ? formatPriceOrPnl(t.realizedPnl) : '—'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </>
    );
};

export default HistoryLedger;