import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { FmpQuote } from '../types';
import * as fmpService from '../services/fmpService';

export interface WatchlistItem {
    ticker: string;
    name: string;
    price: number;
    change: number;
    changesPercentage: number;
}

interface WatchlistContextType {
    watchlist: WatchlistItem[];
    addToWatchlist: (ticker: string, name: string) => void;
    removeFromWatchlist: (ticker: string) => void;
    isOnWatchlist: (ticker: string) => boolean;
    isLoading: boolean;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

const getInitialWatchlist = (): string[] => {
    try {
        const savedWatchlist = localStorage.getItem('ai-paper-trader-watchlist');
        if (savedWatchlist) {
            return JSON.parse(savedWatchlist);
        }
    } catch (error) {
        console.error("Failed to parse watchlist from localStorage", error);
        localStorage.removeItem('ai-paper-trader-watchlist');
    }
    return [];
};


export const WatchlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [watchlistTickers, setWatchlistTickers] = useState<string[]>(getInitialWatchlist);
    const [watchlistData, setWatchlistData] = useState<WatchlistItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    
    useEffect(() => {
        try {
            localStorage.setItem('ai-paper-trader-watchlist', JSON.stringify(watchlistTickers));
        } catch (error) {
            console.error("Failed to save watchlist to localStorage", error);
        }
    }, [watchlistTickers]);


    const updateWatchlistPrices = useCallback(async () => {
        if (watchlistTickers.length === 0) {
            setWatchlistData([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const tickers = watchlistTickers.join(',');
            const quotes = await fmpService.getQuote(tickers);
            
            const updatedWatchlist = watchlistTickers.map(ticker => {
                const quote = quotes.find(q => q.symbol === ticker);
                return {
                    ticker: ticker,
                    name: quote?.name || 'N/A',
                    price: quote?.price || 0,
                    change: quote?.change || 0,
                    changesPercentage: quote?.changesPercentage || 0,
                };
            });

            setWatchlistData(updatedWatchlist);
        } catch (error) {
            console.error("Failed to update watchlist prices:", error);
        } finally {
            setIsLoading(false);
        }
    }, [watchlistTickers]);

    useEffect(() => {
        updateWatchlistPrices();
        const interval = setInterval(updateWatchlistPrices, 60000);
        return () => clearInterval(interval);
    }, [updateWatchlistPrices]);

    const addToWatchlist = useCallback((ticker: string, name: string) => {
        setWatchlistTickers(prev => {
            if (prev.includes(ticker)) return prev;
            return [...prev, ticker];
        });
    }, []);

    const removeFromWatchlist = useCallback((ticker: string) => {
        setWatchlistTickers(prev => prev.filter(t => t !== ticker));
    }, []);

    const isOnWatchlist = useCallback((ticker: string) => {
        return watchlistTickers.includes(ticker);
    }, [watchlistTickers]);


    const value = { watchlist: watchlistData, addToWatchlist, removeFromWatchlist, isOnWatchlist, isLoading };

    return (
        <WatchlistContext.Provider value={value}>
            {children}
        </WatchlistContext.Provider>
    );
};

export const useWatchlist = (): WatchlistContextType => {
    const context = useContext(WatchlistContext);
    if (context === undefined) {
        throw new Error('useWatchlist must be used within a WatchlistProvider');
    }
    return context;
};