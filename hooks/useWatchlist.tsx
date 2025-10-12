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

    console.log('[DEBUG] useWatchlist.tsx: WatchlistProvider rendering.');

    // Effect 1: Manages fetching the LIST of tickers and the primary loading state.
    useEffect(() => {
        console.log('[DEBUG] useWatchlist.tsx: Ticker fetching useEffect triggered. User:', user ? user.uid : 'null');
        if (!user) {
            console.log('[DEBUG] useWatchlist.tsx: No user, resetting watchlist data.');
            setWatchlistTickers([]);
            setWatchlistData([]);
            console.log('[DEBUG] useWatchlist.tsx: Setting isLoading to false (no user).');
            setIsLoading(false);
            return;
        }

        console.log('[DEBUG] useWatchlist.tsx: User found, setting isLoading to true and attaching listener.');
        setIsLoading(true);
        const watchlistDocRef = doc(db, 'users', user.uid, 'data', 'watchlist');
        
        console.log(`[DEBUG] useWatchlist.tsx: Attaching snapshot listener to watchlist path: ${watchlistDocRef.path}`);
        const unsubscribe = onSnapshot(watchlistDocRef, (doc) => {
            console.log('[DEBUG] useWatchlist.tsx: Watchlist snapshot received.');
            const tickers = doc.exists() ? doc.data().tickers || [] : [];
            console.log('[DEBUG] useWatchlist.tsx: Tickers from Firestore:', tickers);
            setWatchlistTickers(tickers);
            console.log('[DEBUG] useWatchlist.tsx: Setting isLoading to false (after ticker snapshot).');
            setIsLoading(false); 
        }, (error) => {
            console.error("[DEBUG] useWatchlist.tsx: FATAL ERROR fetching watchlist snapshot:", error);
            setIsLoading(false);
        });

        return () => {
            console.log('[DEBUG] useWatchlist.tsx: Unsubscribing from Firestore listener.');
            unsubscribe();
        };
    }, [user]);

    // Effect 2: Manages fetching the PRICES for the tickers whenever the list changes.
    useEffect(() => {
        console.log(`[DEBUG] useWatchlist.tsx: Price fetching useEffect triggered. isLoading: ${isLoading}, Ticker count: ${watchlistTickers.length}`);
        if (isLoading) {
            console.log('[DEBUG] useWatchlist.tsx: Skipping price fetch because initial ticker load is not complete.');
            return;
        }

        const updateWatchlistPrices = async () => {
            if (watchlistTickers.length === 0) {
                console.log('[DEBUG] useWatchlist.tsx: No tickers in watchlist, clearing data.');
                setWatchlistData([]); // Clear data if watchlist is empty
                return;
            }
            
            console.log(`[DEBUG] useWatchlist.tsx: Fetching quotes for tickers: ${watchlistTickers.join(',')}`);
            try {
                const tickers = watchlistTickers.join(',');
                const quotes = await fmpService.getQuote(tickers);
                console.log('[DEBUG] useWatchlist.tsx: Received quotes from FMP:', quotes);
                
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
                
                console.log('[DEBUG] useWatchlist.tsx: Setting new watchlist data:', updatedWatchlist);
                setWatchlistData(updatedWatchlist);
            } catch (error) {
                console.error("[DEBUG] useWatchlist.tsx: Failed to update watchlist prices:", error);
            }
        };

        updateWatchlistPrices();
        const interval = setInterval(updateWatchlistPrices, 300000);
        return () => clearInterval(interval);
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
            // --- FIX: Optimistically update the local state ---
            setWatchlistTickers(newTickers); 
            // Now, update the database in the background
            updateWatchlistInDb(newTickers);
        }
    }, [watchlistTickers, user]);

    const removeFromWatchlist = useCallback((ticker: string) => {
        if (!user) return;
        const newTickers = watchlistTickers.filter(t => t !== ticker);
        // --- FIX: Optimistically update the local state ---
        setWatchlistTickers(newTickers);
        // Now, update the database in the background
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