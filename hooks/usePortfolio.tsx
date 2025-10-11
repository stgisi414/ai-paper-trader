import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../src/firebaseConfig'; // <-- CORRECTED PATH
import { useAuth } from '../src/hooks/useAuth.tsx'; //
import type { Portfolio, Holding, OptionHolding, Transaction, FmpQuote } from '../types';
import { INITIAL_CASH } from '../constants';
import * as fmpService from '../services/fmpService';
import { nanoid } from 'nanoid';
import { getOptionsChain } from '../services/optionsProxyService';
import { loadDrawingsFromDB, SavedDrawing } from '../services/drawingService';
import { useNotification } from './useNotification';

interface PortfolioContextType {
    portfolio: Portfolio;
    transactions: Transaction[];
    buyStock: (ticker: string, name: string, shares: number, price: number) => void;
    sellStock: (ticker: string, shares: number, price: number) => void;
    buyOption: (option: OptionHolding) => void;
    sellOption: (symbol: string, shares: number, price: number) => void;
    // ADDITION: New function for manual selling on dashboard
    manualSellOption: (symbol: string) => Promise<void>; 
    totalValue: number;
    isLoading: boolean;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { showNotification } = useNotification();
    const [portfolio, setPortfolio] = useState<Portfolio>({
        cash: INITIAL_CASH,
        holdings: [],
        optionHoldings: [],
        initialValue: INITIAL_CASH,
    });
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            // Reset state for logged-out users and stop loading
            setPortfolio({
                cash: INITIAL_CASH,
                holdings: [],
                optionHoldings: [],
                initialValue: INITIAL_CASH,
            });
            setTransactions([]);
            setIsLoading(false);
            return;
        }

        // Set up listeners for real-time updates from Firestore
        const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
        const transactionsDocRef = doc(db, 'users', user.uid, 'data', 'transactions');

        const unsubPortfolio = onSnapshot(portfolioDocRef, (doc) => {
            if (doc.exists()) {
                setPortfolio(doc.data() as Portfolio);
            } else {
                // If no portfolio exists, create a new one for the user
                const initialPortfolio = {
                    cash: INITIAL_CASH,
                    holdings: [],
                    optionHoldings: [],
                    initialValue: INITIAL_CASH,
                };
                setDoc(portfolioDocRef, initialPortfolio);
                setPortfolio(initialPortfolio);
            }
            setIsLoading(false);
        });
        
        const unsubTransactions = onSnapshot(transactionsDocRef, (doc) => {
            if (doc.exists()) {
                setTransactions(doc.data().transactions || []);
            } else {
                // If no transactions doc exists, create one
                 setDoc(transactionsDocRef, { transactions: [] });
            }
        });

        // Cleanup function to unsubscribe from listeners on component unmount
        return () => {
            unsubPortfolio();
            unsubTransactions();
        };
    }, [user]);

    // Centralized function to save data to Firestore
    const saveData = async (newPortfolio: Portfolio, newTransactions: Transaction[]) => {
        if (!user) return;
        const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
        const transactionsDocRef = doc(db, 'users', user.uid, 'data', 'transactions');
        await setDoc(portfolioDocRef, newPortfolio);
        await setDoc(transactionsDocRef, { transactions: newTransactions });
    };


    // ADDITION: Settlement Logic (to be called inside updateAllPrices)
    const settleExpiredOptions = (
        currentPortfolio: Portfolio, 
        currentTransactions: Transaction[], 
        stockQuotes: FmpQuote[]
    ): { updatedPortfolio: Portfolio; updatedTransactions: Transaction[]; changed: boolean } => {
        let changed = false;
        let newPortfolio = { ...currentPortfolio };
        let newTransactions = [...currentTransactions];
        // Use the current date to determine expiration
        // Set expiry check one minute into the past to account for small clock drift
        const now = Date.now() - (60 * 1000); 

        const unexpiredHoldings: OptionHolding[] = [];

        for (const option of currentPortfolio.optionHoldings) {
            // Check if the expiration date is in the past (using midnight UTC of the expiry date)
            const expiryDate = new Date(option.expirationDate).getTime();
            
            if (expiryDate > now) {
                unexpiredHoldings.push(option);
                continue; // Not expired yet
            }

            changed = true; // Option is expired, must be removed/settled.
            
            const quote = stockQuotes.find(q => q.symbol === option.underlyingTicker);
            const currentStockPrice = quote?.price || 0;
            const contracts = option.shares;

            let intrinsicValue = 0;
            
            if (option.optionType === 'call') {
                intrinsicValue = Math.max(0, currentStockPrice - option.strikePrice);
            } else if (option.optionType === 'put') {
                intrinsicValue = Math.max(0, option.strikePrice - currentStockPrice);
            }
            
            const settlementPrice = intrinsicValue; // Price per share
            // Calculate PnL based on the final settlement price vs purchase price
            const realizedPnl = (settlementPrice - option.purchasePrice) * contracts * 100;
            const cashProceeds = settlementPrice * contracts * 100;
            const settlementType = intrinsicValue > 0 ? 'OPTION_EXERCISE' : 'OPTION_EXPIRE';

            console.log(`[OPTION SETTLEMENT] ${option.symbol} expired. Type: ${settlementType}. Final Price: ${settlementPrice.toFixed(2)}. PnL: ${realizedPnl.toFixed(2)}`);

            const settlementTransaction: Transaction = {
                id: nanoid(), 
                type: settlementType, 
                ticker: option.underlyingTicker, 
                shares: contracts, 
                price: settlementPrice, 
                totalAmount: cashProceeds, 
                timestamp: Date.now(), 
                purchasePrice: option.purchasePrice, 
                realizedPnl: realizedPnl,
                optionSymbol: option.symbol,
                optionType: option.optionType,
                strikePrice: option.strikePrice,
            };

            newTransactions.push(settlementTransaction);
            newPortfolio.cash += cashProceeds;
        }

        newPortfolio.optionHoldings = unexpiredHoldings;

        return { updatedPortfolio: newPortfolio, updatedTransactions: newTransactions, changed };
    };


    // This useEffect hook handles periodic price updates for all holdings
    useEffect(() => {
        const updateAllPrices = async () => {
             // Prevent execution if user is not logged in or there's nothing to track
             if (!user || (portfolio.holdings.length === 0 && portfolio.optionHoldings.length === 0)) {
                console.log(`[UPDATE ALL PRICES] Skip: No user or no holdings.`);
                return; 
            }
            
            console.log(`[UPDATE ALL PRICES] Starting price refresh...`);
            
            try {
                // Identify all unique tickers that need price updates or drawing checks
                const stockTickers = portfolio.holdings.map(h => h.ticker);
                const optionTickers = portfolio.optionHoldings.map(o => o.underlyingTicker);
                const allRelevantTickers = [...new Set([...stockTickers, ...optionTickers])];

                // 1. Prepare promises for initial data fetch (Quotes and Drawings)
                const quotePromise = fmpService.getQuote(allRelevantTickers.join(','));
                const drawingsPromises = Promise.all(allRelevantTickers.map(ticker => loadDrawingsFromDB(user, ticker)));
                
                // Execute fetching of quotes and drawings concurrently
                const [quotes, allDrawings] = await Promise.all([quotePromise, drawingsPromises]);

                // Map drawings to tickers for easy lookup: { 'AAPL': [...drawings] }
                const drawingsMap = allRelevantTickers.reduce((acc, ticker, index) => {
                    acc[ticker] = allDrawings[index];
                    return acc;
                }, {} as Record<string, SavedDrawing[]>);
                
                // 2. Check Price Alerts (NEW FEATURE LOGIC)
                const currentTime = Date.now() / 1000; // Lightweight Charts uses time in seconds

                quotes.forEach(quote => {
                    const ticker = quote.symbol;
                    const price = quote.price;
                    const drawings = drawingsMap[ticker] || [];
                    
                    if (drawings.length === 0) return;

                    drawings.forEach(drawing => {
                        // Extract time (t) and price (p) coordinates
                        const t1 = drawing.p1.time as number; 
                        const t2 = drawing.p2.time as number; 
                        const p1 = drawing.p1.price;
                        const p2 = drawing.p2.price;

                        const minPrice = Math.min(p1, p2);
                        const maxPrice = Math.max(p1, p2);
                        const maxTime = Math.max(t1, t2);

                        // CRITERIA 1: Check if the rectangle's time scope includes the present/future.
                        // If the rightmost edge (maxTime) is later than now, we consider it active.
                        const isFutureBox = maxTime > currentTime;
                        
                        // CRITERIA 2: Check if the current stock price is within the rectangle's price bounds.
                        const priceCrossed = price >= minPrice && price <= maxPrice;

                        if (isFutureBox && priceCrossed) {
                            showNotification({
                                sender: { uid: 'system', displayName: 'System Alert', email: '', photoURL: '' },
                                text: `Price Alert! ${ticker} just entered the range of a saved rectangle (Price: ${formatCurrency(price)}, Range: ${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)})`
                            });
                            console.log(`[ALERT TRIGGER] Ticker: ${ticker}, Price: ${price}, Range: ${minPrice}-${maxPrice}`);
                        }
                    });
                });
                
                // 3. Prepare for Portfolio Update (Options Chain Fetch)
                const optionFetchPairs = Array.from(new Set(
                    portfolio.optionHoldings.map(o => `${o.underlyingTicker}_${o.expirationDate}`)
                )).map(pair => {
                    const [ticker, date] = pair.split('_');
                    return { ticker, date };
                });
                
                // Fetch option chains
                const optionChainsResults = await Promise.all(
                     optionFetchPairs.map(pair => getOptionsChain(pair.ticker, pair.date))
                );
                
                // Combine all fetched option contracts into one array for easier searching
                const flatOptionChains = optionChainsResults.flatMap(result => result.contracts);
                
                let tempPortfolio = { ...portfolio };
                let currentTransactions = [...transactions];
                let changed = false;

                // 4. Update stock holdings prices
                tempPortfolio.holdings = tempPortfolio.holdings.map(holding => {
                    const quote = quotes.find(q => q.symbol === holding.ticker);
                    if (quote && quote.price !== holding.currentPrice) {
                        changed = true;
                        return { ...holding, currentPrice: quote.price };
                    }
                    return holding;
                });
                
                // 5. Settle Expired Options (updates tempPortfolio and currentTransactions)
                const { updatedPortfolio: settledPortfolio, updatedTransactions: settledTransactions, changed: settledChanged } = settleExpiredOptions(
                    tempPortfolio, 
                    currentTransactions, 
                    quotes // Pass all fetched stock quotes
                );
                
                tempPortfolio = settledPortfolio;
                currentTransactions = settledTransactions;
                changed = changed || settledChanged;
                
                // 6. Update Prices for Remaining Options
                tempPortfolio.optionHoldings = tempPortfolio.optionHoldings.map((option) => {
                    const freshOptionData = flatOptionChains.find(o => o.symbol === option.symbol);
                    
                    if (freshOptionData) {
                         const newPrice = freshOptionData.close_price;
                         
                         if (newPrice !== null && newPrice !== undefined) {
                            const epsilon = 0.0001; 
                            const isPriceChanged = Math.abs(newPrice - option.currentPrice) > epsilon;

                            if (isPriceChanged) {
                                changed = true;
                                // Update the currentPrice and all market-related fields from the fresh data
                                return { 
                                    ...option, 
                                    currentPrice: newPrice, 
                                    delta: freshOptionData.delta,
                                    gamma: freshOptionData.gamma,
                                    theta: freshOptionData.theta,
                                    vega: freshOptionData.vega,
                                    impliedVolatility: freshOptionData.impliedVolatility,
                                    open_interest: freshOptionData.open_interest,
                                    volume: freshOptionData.volume
                                };
                            }
                        } 
                    }
                    return option;
                });

                // 7. Save changes if detected
                if (changed) {
                    const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
                    console.log(`[UPDATE ALL PRICES] Changes detected. Saving portfolio to Firestore.`);
                    await setDoc(portfolioDocRef, tempPortfolio, { merge: true });
                    setTransactions(currentTransactions);
                } else {
                    console.log(`[UPDATE ALL PRICES] No material changes detected. Skipping Firestore save.`);
                }

            } catch (error) {
                console.error("[UPDATE ALL PRICES - FAIL] Failed to update prices or run alerts:", error);
            }
        };

        updateAllPrices(); // Run once on load
        const interval = setInterval(updateAllPrices, 60000); // Then, refresh every minute
        return () => clearInterval(interval);

    }, [user, portfolio.holdings, portfolio.optionHoldings, transactions, showNotification]); // MODIFICATION: Added showNotification dependency

    const buyStock = useCallback(async (ticker: string, name: string, shares: number, price: number) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        const cost = shares * price;
        if (portfolio.cash < cost) {
            alert("Not enough cash to complete purchase.");
            return;
        }

        const newTransaction: Transaction = {
            id: nanoid(), type: 'BUY', ticker, shares, price, totalAmount: cost, timestamp: Date.now(),
        };
        const newTransactions = [...transactions, newTransaction];

        const newHoldings = [...portfolio.holdings];
        const existingHoldingIndex = newHoldings.findIndex(h => h.ticker === ticker);
        if (existingHoldingIndex > -1) {
            const existing = newHoldings[existingHoldingIndex];
            const totalShares = existing.shares + shares;
            const totalCost = (existing.shares * existing.purchasePrice) + cost;
            newHoldings[existingHoldingIndex] = { ...existing, shares: totalShares, purchasePrice: totalCost / totalShares };
        } else {
            newHoldings.push({ ticker, name, shares, purchasePrice: price, currentPrice: price });
        }
        
        const newPortfolio: Portfolio = { ...portfolio, cash: portfolio.cash - cost, holdings: newHoldings };
        await saveData(newPortfolio, newTransactions);
    }, [portfolio, transactions, user]);

    const sellStock = useCallback(async (ticker: string, shares: number, price: number) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        const existingHolding = portfolio.holdings.find(h => h.ticker === ticker);
        if (!existingHolding || existingHolding.shares < shares) {
            alert("You don't own enough shares to sell.");
            return;
        }

        const proceeds = shares * price;
        const realizedPnl = (price - existingHolding.purchasePrice) * shares;

        const newTransaction: Transaction = {
            id: nanoid(), type: 'SELL', ticker, shares, price, totalAmount: proceeds, timestamp: Date.now(), purchasePrice: existingHolding.purchasePrice, realizedPnl,
        };
        const newTransactions = [...transactions, newTransaction];

        let newHoldings = [...portfolio.holdings];
        if (existingHolding.shares === shares) {
            newHoldings = newHoldings.filter(h => h.ticker !== ticker);
        } else {
            const holdingIndex = newHoldings.findIndex(h => h.ticker === ticker);
            newHoldings[holdingIndex] = { ...existingHolding, shares: existingHolding.shares - shares };
        }

        const newPortfolio: Portfolio = { ...portfolio, cash: portfolio.cash + proceeds, holdings: newHoldings };
        await saveData(newPortfolio, newTransactions);
    }, [portfolio, transactions, user]);

    const sellOption = useCallback(async (symbol: string, shares: number, price: number) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        const existingOption = portfolio.optionHoldings.find(o => o.symbol === symbol);
        if (!existingOption || existingOption.shares < shares) {
            alert("You don't own enough contracts to sell.");
            return;
        }

        const proceeds = shares * price * 100;
        const realizedPnl = (price - existingOption.purchasePrice) * shares * 100;

        const newTransaction: Transaction = {
            id: nanoid(), type: 'OPTION_SELL', ticker: existingOption.underlyingTicker, shares, price, totalAmount: proceeds, timestamp: Date.now(), purchasePrice: existingOption.purchasePrice, realizedPnl, optionSymbol: existingOption.symbol, optionType: existingOption.optionType, strikePrice: existingOption.strikePrice,
        };
        const newTransactions = [...transactions, newTransaction];
        
        let newOptionHoldings = [...portfolio.optionHoldings];
        if (existingOption.shares === shares) {
            newOptionHoldings = newOptionHoldings.filter(o => o.symbol !== symbol);
        } else {
            const optionIndex = newOptionHoldings.findIndex(o => o.symbol === symbol);
            newOptionHoldings[optionIndex] = { ...existingOption, shares: existingOption.shares - shares };
        }

        const newPortfolio: Portfolio = { ...portfolio, cash: portfolio.cash + proceeds, optionHoldings: newOptionHoldings };
        await saveData(newPortfolio, newTransactions);
    }, [portfolio, transactions, user]);

    const buyOption = useCallback(async (option: OptionHolding) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        // Price check is now handled in StockView.tsx
        const cost = option.shares * option.purchasePrice * 100;
        
        const newTransaction: Transaction = {
            id: nanoid(), type: 'OPTION_BUY', ticker: option.underlyingTicker, shares: option.shares, price: option.purchasePrice, totalAmount: cost, timestamp: Date.now(), optionSymbol: option.symbol, optionType: option.optionType, strikePrice: option.strikePrice,
        };
        const newTransactions = [...transactions, newTransaction];
        
        const newPortfolio: Portfolio = { ...portfolio, cash: portfolio.cash - cost, optionHoldings: [...portfolio.optionHoldings, option] };
        await saveData(newPortfolio, newTransactions);
    }, [portfolio, transactions, user]);

    // ADDITION: Manual sell wrapper for Dashboard button
    const manualSellOption = useCallback(async (symbol: string) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        const existingOption = portfolio.optionHoldings.find(o => o.symbol === symbol);
        if (!existingOption) {
            alert("Option contract not found in portfolio.");
            return;
        }
        
        // Use the current market price for the sale
        const salePrice = existingOption.currentPrice; 
        
        // This sells ALL contracts for the option symbol
        await sellOption(symbol, existingOption.shares, salePrice);
    }, [portfolio.optionHoldings, sellOption, user]);


    const totalValue = useMemo(() => {
        const holdingsValue = portfolio.holdings.reduce((acc, h) => acc + (h.shares * h.currentPrice), 0);
        const optionsValue = portfolio.optionHoldings.reduce((acc, o) => acc + (o.shares * o.currentPrice * 100), 0);
        return portfolio.cash + holdingsValue + optionsValue;
    }, [portfolio]);

    const value = { portfolio, transactions, buyStock, sellStock, buyOption, sellOption, manualSellOption, totalValue, isLoading };

    return (
        <PortfolioContext.Provider value={value}>
            {children}
        </PortfolioContext.Provider>
    );
};

export const usePortfolio = (): PortfolioContextType => {
    const context = useContext(PortfolioContext);
    if (context === undefined) {
        throw new Error('usePortfolio must be used within a PortfolioProvider');
    }
    return context;
};
