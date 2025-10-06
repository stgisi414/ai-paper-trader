import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../src/firebaseConfig'; // <-- CORRECTED PATH
import { useAuth } from '../src/hooks/useAuth.tsx'; // <-- CORRECTED PATH
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

    // Effect to listen for watchlist changes in Firestore
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
            if (doc.exists()) {
                setWatchlistTickers(doc.data().tickers || []);
            } else {
                // If no watchlist exists, create a new one for the user
                setDoc(watchlistDocRef, { tickers: [] });
            }
        });

        return () => unsubscribe();
    }, [user]);

    // Effect to fetch price data when the list of tickers changes
    useEffect(() => {
        const updateWatchlistPrices = async () => {
            /*
            if (watchlistTickers.length === 0) {
                setWatchlistData([]);
                setIsLoading(false);
                return;
            }
            
            setIsLoading(true);
            try {
                const tickers = watchlistTickers.join(',');
                const quotes = await fmpService.getQuote(tickers);
                
                // Maintain the order from watchlistTickers
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
            */
        };

        updateWatchlistPrices();
        const interval = setInterval(updateWatchlistPrices, 60000); // Refresh every minute
        return () => clearInterval(interval);
    }, [watchlistTickers]);


    // Helper function to update the watchlist in Firestore
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


    const value = { watchlist: watchlistData, addToWatchlist, removeFromWatchlist, reorderWatchlist, isOnWatchlist, isLoading };

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