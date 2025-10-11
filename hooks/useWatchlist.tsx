import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../src/firebaseConfig';
import { useAuth } from '../src/hooks/useAuth.tsx';
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
    reorderWatchlist: (startIndex: number, endIndex: number) => void;
    isOnWatchlist: (ticker: string) => boolean;
    isLoading: boolean;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

export const WatchlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [watchlistTickers, setWatchlistTickers] = useState<string[]>([]);
    const [watchlistData, setWatchlistData] = useState<WatchlistItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Effect 1: Manages fetching the LIST of tickers and the primary loading state.
    useEffect(() => {
        if (!user) {
            setWatchlistTickers([]);
            setWatchlistData([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const watchlistDocRef = doc(db, 'users', user.uid, 'data', 'watchlist');
        
        const unsubscribe = onSnapshot(watchlistDocRef, (doc) => {
            const tickers = doc.exists() ? doc.data().tickers || [] : [];
            setWatchlistTickers(tickers);
            // The list of tickers has been loaded, so we can set loading to false.
            setIsLoading(false); 
        }, (error) => {
            console.error("Error fetching watchlist tickers:", error);
            setIsLoading(false); // Also stop loading on error
        });

        return () => unsubscribe();
    }, [user]);

    // Effect 2: Manages fetching the PRICES for the tickers whenever the list changes.
    useEffect(() => {
        // Do not run this effect until the initial ticker list has been loaded.
        if (isLoading) return;

        const updateWatchlistPrices = async () => {
            if (watchlistTickers.length === 0) {
                setWatchlistData([]); // Clear data if watchlist is empty
                return;
            }
            
            try {
                const tickers = watchlistTickers.join(',');
                const quotes = await fmpService.getQuote(tickers);
                
                const quoteMap = new Map<string, FmpQuote>();
                quotes.forEach(q => quoteMap.set(q.symbol, q));

                const updatedWatchlist = watchlistTickers.map(ticker => {
                    const quote = quoteMap.get(ticker);
                    return {
                        ticker: ticker,
                        name: quote?.name || 'Loading...',
                        price: quote?.price || 0,
                        change: quote?.change || 0,
                        changesPercentage: quote?.changesPercentage || 0,
                    };
                });

                setWatchlistData(updatedWatchlist);
            } catch (error) {
                console.error("Failed to update watchlist prices:", error);
            }
        };

        updateWatchlistPrices();
        const interval = setInterval(updateWatchlistPrices, 300000);
        return () => clearInterval(interval);
    // This effect now correctly depends on both the tickers list and the initial loading state.
    }, [watchlistTickers, isLoading]);


    const updateWatchlistInDb = async (tickers: string[]) => {
        if (!user) return;
        const watchlistDocRef = doc(db, 'users', user.uid, 'data', 'watchlist');
        await setDoc(watchlistDocRef, { tickers });
    };

    const addToWatchlist = useCallback((ticker: string, name: string) => {
        if (!user) {
            alert("Please log in to add stocks to your watchlist.");
            return;
        }
        if (!watchlistTickers.includes(ticker)) {
            const newTickers = [...watchlistTickers, ticker];
            updateWatchlistInDb(newTickers);
        }
    }, [watchlistTickers, user]);

    const removeFromWatchlist = useCallback((ticker: string) => {
        if (!user) return;
        const newTickers = watchlistTickers.filter(t => t !== ticker);
        updateWatchlistInDb(newTickers);
    }, [watchlistTickers, user]);
    
    const reorderWatchlist = useCallback((startIndex: number, endIndex: number) => {
        if (!user) return;
        const result = Array.from(watchlistTickers);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        updateWatchlistInDb(result);
    }, [watchlistTickers, user]);

    const isOnWatchlist = useCallback((ticker: string) => {
        return watchlistTickers.includes(ticker);
    }, [watchlistTickers]);

    const value = useMemo(() => ({
        watchlist: watchlistData,
        addToWatchlist,
        removeFromWatchlist,
        reorderWatchlist,
        isOnWatchlist,
        isLoading
    }), [watchlistData, addToWatchlist, removeFromWatchlist, reorderWatchlist, isOnWatchlist, isLoading]);

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