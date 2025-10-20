import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { doc, onSnapshot, setDoc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../src/firebaseConfig';
import { useAuth } from '../src/hooks/useAuth.tsx';
import type { FmpQuote, FmpProfile, UserWatchlists as OldUserWatchlists } from '../types';
import * as fmpService from '../services/fmpService';

export type WatchlistSortKey = 'ticker' | 'change';
export type WatchlistSortDirection = 'asc' | 'desc';

// Define the new ordered structure for a single watchlist
export interface Watchlist {
    name: string;
    tickers: string[];
}
// Define the collection of all watchlists, which is an array to preserve order
export type WatchlistCollection = Watchlist[];

export interface WatchlistItem {
    ticker: string;
    name: string;
    price: number;
    change: number;
    changesPercentage: number;
    sector?: string;
}

interface WatchlistContextType {
    watchlist: WatchlistItem[];
    allWatchlists: WatchlistCollection;
    activeWatchlist: string;
    setActiveWatchlist: (name: string) => void;
    addToWatchlist: (ticker: string, name: string) => void;
    removeFromWatchlist: (ticker: string) => void;
    reorderWatchlistItems: (startIndex: number, endIndex: number) => void;
    createNewWatchlist: (name: string) => Promise<void>;
    deleteWatchlist: (name: string) => Promise<void>;
    renameWatchlist: (oldName: string, newName: string) => Promise<void>;
    reorderWatchlists: (startIndex: number, endIndex: number) => Promise<void>;
    isOnWatchlist: (ticker: string) => boolean;
    isLoading: boolean;
    sortKey: WatchlistSortKey | null;
    sortDirection: WatchlistSortDirection;
    setSort: (key: WatchlistSortKey | null) => void;
    isOnWatchlist: (ticker: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

export const WatchlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [allWatchlists, setAllWatchlists] = useState<WatchlistCollection>([{ name: 'My Watchlist', tickers: [] }]);
    const [activeWatchlist, setActiveWatchlist] = useState<string>('My Watchlist');
    const [watchlistData, setWatchlistData] = useState<WatchlistItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [sortKey, setSortKey] = useState<WatchlistSortKey | null>(null);
    const [sortDirection, setSortDirection] = useState<WatchlistSortDirection>('desc');

    const watchlistTickers = useMemo(() => {
        return allWatchlists.find(w => w.name === activeWatchlist)?.tickers || [];
    }, [allWatchlists, activeWatchlist]);

    useEffect(() => {
        if (!user) {
            setAllWatchlists([{ name: 'My Watchlist', tickers: [] }]);
            setActiveWatchlist('My Watchlist');
            setWatchlistData([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        const watchlistsDocRef = doc(db, 'users', user.uid, 'data', 'watchlists');

        const unsubscribe = onSnapshot(watchlistsDocRef, async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                // **MIGRATION LOGIC**: Check if data is in old object format or new array format
                if (data && !Array.isArray(data.lists)) { // Old format (object) detected
                    console.log("Migrating old watchlist object format to ordered array format...");
                    const oldWatchlists = data as OldUserWatchlists;
                    const newWatchlistArray = Object.keys(oldWatchlists).map(name => ({
                        name,
                        tickers: oldWatchlists[name] || []
                    }));
                    // Save the new array format
                    await setDoc(watchlistsDocRef, { lists: newWatchlistArray });
                    // The onSnapshot will re-trigger with the correct format, so we don't set state here.
                    return; 
                } else { // New format (array) exists
                    const lists = (data?.lists as WatchlistCollection) || [];
                    setAllWatchlists(lists);
                    // Ensure the active watchlist exists, if not, reset to the first one
                    if (!lists.some(w => w.name === activeWatchlist)) {
                        setActiveWatchlist(lists[0]?.name || 'My Watchlist');
                    }
                }
            } else {
                 // New user setup
                const defaultLists: WatchlistCollection = [
                    { name: 'My Watchlist', tickers: [] },
                    { name: 'Trending Tech', tickers: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'META'] },
                ];
                await setDoc(watchlistsDocRef, { lists: defaultLists });
                setAllWatchlists(defaultLists);
                setActiveWatchlist('My Watchlist');
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching watchlists:", error);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [user]); // Removed activeWatchlist from dep array to prevent re-subscribing on switch

    useEffect(() => {
        if (isLoading) return;

        const updateWatchlistPrices = async () => {
            if (watchlistTickers.length === 0) {
                setWatchlistData([]);
                return;
            }
            
            try {
                const tickers = watchlistTickers.join(',');
                // Fetch quotes and profiles
                const [quotes, profiles] = await Promise.all([
                    fmpService.getQuote(tickers),
                    fmpService.getProfile(tickers) // Fetch profiles too
                ]);

                // Create maps for efficient lookup
                const quoteMap = new Map<string, FmpQuote>();
                quotes.forEach(q => quoteMap.set(q.symbol, q));

                const profileMap = new Map<string, FmpProfile>(); // Map for profiles
                profiles.forEach(p => profileMap.set(p.symbol, p));


                // Map tickers to WatchlistItem including sector
                const updatedWatchlist = watchlistTickers.map(ticker => {
                    const quote = quoteMap.get(ticker);
                    const profile = profileMap.get(ticker); // Get profile
                    return {
                        ticker: ticker,
                        name: quote?.name || 'Loading...', // Use quote name primarily
                        price: quote?.price || 0,
                        change: quote?.change || 0,
                        changesPercentage: quote?.changesPercentage || 0,
                        sector: profile?.sector || 'N/A', // Add sector
                    };
                });

                setWatchlistData(updatedWatchlist);
            } catch (error) {
                console.error("Failed to update watchlist prices:", error);
                // Consider setting an error state here for the UI
                setWatchlistData([]); // Clear data on error to avoid showing stale info
            }
        };

        updateWatchlistPrices();
        // Consider if you really need the interval or if fetching on dependency change is enough
        const interval = setInterval(updateWatchlistPrices, 300000); // 5 minutes
        return () => clearInterval(interval);

    // --- FIX: Add activeWatchlist to the dependency array ---
    }, [watchlistTickers, isLoading, activeWatchlist]);

    const updateWatchlistsInDb = async (lists: WatchlistCollection) => {
        if (!user) return;
        const watchlistDocRef = doc(db, 'users', user.uid, 'data', 'watchlists');
        await setDoc(watchlistDocRef, { lists });
    };

    const createNewWatchlist = useCallback(async (name: string) => {
        if (!user) return;
        if (Object.keys(allWatchlists).length >= 20) {
            alert('You can only have a maximum of 20 watchlists.');
            return;
        }
        if (allWatchlists.some(w => w.name === name)) {
            alert('A watchlist with this name already exists.');
            return;
        }
        const newLists = [...allWatchlists, { name, tickers: [] }];
        await updateWatchlistsInDb(newLists);
        setActiveWatchlist(name); // Switch to the new list
    }, [user, allWatchlists]);

    const addToWatchlist = useCallback((ticker: string) => {
        if (!user) {
            alert("Please log in to add stocks to your watchlist.");
            return;
        }
        const currentTickers = allWatchlists.find(w => w.name === activeWatchlist)?.tickers || [];
        if (!currentTickers.includes(ticker)) {
            const newTickers = [...currentTickers, ticker];
            const newLists = allWatchlists.map(w => w.name === activeWatchlist ? { ...w, tickers: newTickers } : w);
            updateWatchlistsInDb(newLists);
            // FIX: Explicitly reset the active watchlist to prevent it from reverting
            // to the default (list[0]) after the Firestore snapshot triggers.
            setActiveWatchlist(activeWatchlist);
        }
    }, [user, allWatchlists, activeWatchlist]);

    const removeFromWatchlist = useCallback((ticker: string) => {
        if (!user) return;
        const currentTickers = allWatchlists.find(w => w.name === activeWatchlist)?.tickers || [];
        const newTickers = currentTickers.filter(t => t !== ticker);
        const newLists = allWatchlists.map(w => w.name === activeWatchlist ? { ...w, tickers: newTickers } : w);
        updateWatchlistsInDb(newLists);
    }, [user, allWatchlists, activeWatchlist]);
    
    const reorderWatchlistItems = useCallback((startIndex: number, endIndex: number) => {
        if (!user) return;
        const currentTickers = allWatchlists.find(w => w.name === activeWatchlist)?.tickers || [];
        const result = Array.from(currentTickers);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        const newLists = allWatchlists.map(w => w.name === activeWatchlist ? { ...w, tickers: result } : w);
        updateWatchlistsInDb(newLists);
    }, [user, allWatchlists, activeWatchlist]);

    const deleteWatchlist = useCallback(async (nameToDelete: string) => {
        if (!user) return;
        if (allWatchlists.length <= 1) {
            alert("You must have at least one watchlist.");
            return;
        }
        const newLists = allWatchlists.filter(w => w.name !== nameToDelete);
        if (activeWatchlist === nameToDelete) {
            setActiveWatchlist(newLists[0]?.name || '');
        }
        await updateWatchlistsInDb(newLists);
    }, [user, allWatchlists, activeWatchlist]);

    const renameWatchlist = useCallback(async (oldName: string, newName: string) => {
        if (!user || !newName.trim() || oldName === newName) return;
        if (allWatchlists.some(w => w.name === newName)) {
            alert("A watchlist with this name already exists.");
            return;
        }
        const newLists = allWatchlists.map(w => w.name === oldName ? { ...w, name: newName.trim() } : w);
        if (activeWatchlist === oldName) {
            setActiveWatchlist(newName.trim());
        }
        await updateWatchlistsInDb(newLists);
    }, [user, allWatchlists, activeWatchlist]);

    const reorderWatchlists = useCallback(async (startIndex: number, endIndex: number) => {
        if (!user) return;
        const result = Array.from(allWatchlists);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);
        await updateWatchlistsInDb(result);
    }, [user, allWatchlists]);
    
    const isOnWatchlist = useCallback((ticker: string) => {
        return watchlistTickers.includes(ticker);
    }, [watchlistTickers]);

    const setSort = useCallback((key: WatchlistSortKey | null) => {
        setSortKey(prevKey => {
            if (prevKey === key && key !== null) {
                // Toggle direction if same key clicked
                setSortDirection(prevDir => (prevDir === 'asc' ? 'desc' : 'asc'));
                return key;
            } else {
                // New key clicked or clearing sort.
                // Default descending for 'change' (High to Low), ascending for 'ticker' (A-Z).
                setSortDirection(key === 'ticker' ? 'asc' : 'desc');
                return key;
            }
        });
    }, []);

    const value = useMemo(() => ({
        watchlist: watchlistData,
        allWatchlists,
        activeWatchlist,
        setActiveWatchlist,
        addToWatchlist,
        removeFromWatchlist,
        reorderWatchlistItems,
        createNewWatchlist,
        deleteWatchlist,
        renameWatchlist,
        reorderWatchlists,
        isOnWatchlist,
        isLoading,
        sortKey,
        sortDirection,
        setSort
    }), [watchlistData, allWatchlists, activeWatchlist, addToWatchlist, removeFromWatchlist, reorderWatchlistItems, createNewWatchlist, deleteWatchlist, renameWatchlist, reorderWatchlists, isOnWatchlist, isLoading, sortKey, sortDirection, setSort ]);


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
