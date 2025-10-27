import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../src/firebaseConfig';
import { useAuth } from '../src/hooks/useAuth.tsx';
import type { Portfolio, Holding, OptionHolding, Transaction, FmpQuote } from '../types';
import { INITIAL_CASH } from '../constants';
import * as fmpService from '../services/fmpService';
import { nanoid } from 'nanoid';
import { getOptionsChain } from '../services/optionsProxyService';
import { loadDrawingsFromDB, SavedDrawing } from '../services/drawingService';
import { useNotification } from './useNotification';
import { formatCurrency } from '../utils/formatters';

interface PortfolioContextType {
    portfolio: Portfolio;
    transactions: Transaction[];
    buyStock: (ticker: string, name: string, shares: number, price: number) => void;
    sellStock: (ticker: string, shares: number, price: number) => void;
    sellAllStock: (ticker: string) => Promise<void>; // ADD THIS
    buyOption: (option: OptionHolding, stopLossPrice?: number | null) => void;
    sellOption: (symbol: string, shares: number, price: number) => void;
    triggerStopLossSell: (optionHolding: OptionHolding, currentPrice: number) => Promise<void>;
    manualSellOption: (symbol: string) => Promise<void>;
    updateOptionStopLoss: (symbol: string, newStopLossPrice: number | null) => Promise<void>;
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
    const recentAlertsRef = useRef<Record<string, number>>({});
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const processingStopLossRef = useRef<Set<string>>(new Set());

    console.log('[DEBUG] usePortfolio.tsx: PortfolioProvider rendering.');

    const portfolioRef = useRef(portfolio);
    useEffect(() => {
        portfolioRef.current = portfolio;
    }, [portfolio]);

    const transactionsRef = useRef(transactions);
    useEffect(() => {
        transactionsRef.current = transactions;
    }, [transactions]);

    useEffect(() => {
        console.log('[DEBUG] usePortfolio.tsx: Main data fetching useEffect triggered. User:', user ? user.uid : 'null');
        if (!user) {
            console.log('[DEBUG] usePortfolio.tsx: No user, resetting portfolio and transactions.');
            setPortfolio({
                cash: INITIAL_CASH,
                holdings: [],
                optionHoldings: [],
                initialValue: INITIAL_CASH,
            });
            setTransactions([]);
            console.log('[DEBUG] usePortfolio.tsx: Setting isLoading to false (no user).');
            setIsLoading(false);
            return;
        }

        // --- TEMPORARY DISABLE START ---
        /* console.log('[DEBUG] usePortfolio.tsx: User found. TEMPORARILY DISABLING Firestore listeners and live pricing.');
        setPortfolio({
            cash: INITIAL_CASH,
            holdings: [],
            optionHoldings: [],
            initialValue: INITIAL_CASH,
        });
        setTransactions([]);
        setIsLoading(false);
        const interval = setInterval(() => {   }, 300000); // Stop price updates 
        return () => clearInterval(interval); */
        // --- TEMPORARY DISABLE END ---

        console.log('[DEBUG] usePortfolio.tsx: User found, setting isLoading to true and attaching Firestore listeners.');
        setIsLoading(true);
        const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
        const transactionsDocRef = doc(db, 'users', user.uid, 'data', 'transactions');

        console.log(`[DEBUG] usePortfolio.tsx: Attaching snapshot listener to portfolio path: ${portfolioDocRef.path}`);
        

        const unsubPortfolio = onSnapshot(portfolioDocRef, (doc) => {
            console.log('[DEBUG] usePortfolio.tsx: Portfolio snapshot received.');
            if (doc.exists()) {
                const data = doc.data() as Portfolio;
                 // Ensure default stopLossPrice if missing from Firestore
                const optionsWithDefaults = data.optionHoldings.map(o => ({
                    ...o,
                    stopLossPrice: o.stopLossPrice === undefined ? null : o.stopLossPrice
                }));
                console.log('[DEBUG] usePortfolio.tsx: Portfolio document exists. Data:', {...data, optionHoldings: optionsWithDefaults});
                setPortfolio({...data, optionHoldings: optionsWithDefaults});

            } else {
                 console.log('[DEBUG] usePortfolio.tsx: Portfolio document does NOT exist. Creating default.');
                 const defaultPortfolio: Portfolio = {
                    cash: INITIAL_CASH,
                    holdings: [],
                    optionHoldings: [],
                    initialValue: INITIAL_CASH,
                };
                 setDoc(portfolioDocRef, defaultPortfolio); // Create default doc
                 setPortfolio(defaultPortfolio);
            }
            console.log('[DEBUG] usePortfolio.tsx: Setting isLoading to false (after portfolio snapshot).');
            setIsLoading(false); // Set loading false after portfolio is processed
        }, (error) => {
            console.error("[DEBUG] usePortfolio.tsx: FATAL ERROR fetching portfolio snapshot:", error);
            setIsLoading(false);
        });
        
        console.log(`[DEBUG] usePortfolio.tsx: Attaching snapshot listener to transactions path: ${transactionsDocRef.path}`);
        const unsubTransactions = onSnapshot(transactionsDocRef, (doc) => {
            console.log('[DEBUG] usePortfolio.tsx: Transactions snapshot received.');
            if (doc.exists()) {
                console.log('[DEBUG] usePortfolio.tsx: Transactions document exists. Count:', (doc.data().transactions || []).length);
                setTransactions(doc.data().transactions || []);
            } else {
                 console.log('[DEBUG] usePortfolio.tsx: Transactions document does NOT exist. Creating empty transactions array.');
                 setDoc(transactionsDocRef, { transactions: [] }); // Create default doc
                 setTransactions([]);
            }
        }, (error) => {
            console.error("[DEBUG] usePortfolio.tsx: FATAL ERROR fetching transactions snapshot:", error);
        });

        return () => {
            console.log('[DEBUG] usePortfolio.tsx: Unsubscribing from Firestore listeners.');
            unsubPortfolio();
            unsubTransactions();
        };
    }, [user]);

    const saveData = useCallback(async (newPortfolio: Portfolio, newTransactions: Transaction[]) => {
        if (!user) return;
        // Ensure stopLossPrice is saved (or nullified if needed)
        const portfolioToSave = {
            ...newPortfolio,
            optionHoldings: newPortfolio.optionHoldings.map(o => ({
                ...o,
                stopLossPrice: o.stopLossPrice === undefined ? null : o.stopLossPrice
            }))
        };
        const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
        const transactionsDocRef = doc(db, 'users', user.uid, 'data', 'transactions');

        // Use writeBatch for atomic update
        const batch = writeBatch(db);
        batch.set(portfolioDocRef, portfolioToSave); // Use set to overwrite or create
        batch.set(transactionsDocRef, { transactions: newTransactions }); // Use set to overwrite or create

        try {
            await batch.commit();
            console.log("[DEBUG] saveData successful.");
        } catch (error) {
            console.error("[DEBUG] saveData failed:", error);
        }

    }, [user]);

    const triggerStopLossSell = useCallback(async (optionHolding: OptionHolding, currentPrice: number) => {
        if (!user || processingStopLossRef.current.has(optionHolding.symbol)) return;

        processingStopLossRef.current.add(optionHolding.symbol); // Mark as processing
        console.log(`[STOP LOSS TRIGGERED] for ${optionHolding.symbol} at price ${formatCurrency(currentPrice)} (SL: ${formatCurrency(optionHolding.stopLossPrice)})`);

        // Use the current price as the execution price for the simulation
        const sellPrice = currentPrice;
        const proceeds = optionHolding.shares * sellPrice * 100;
        const realizedPnl = (sellPrice - optionHolding.purchasePrice) * optionHolding.shares * 100;

        const stopLossTransaction: Transaction = {
            id: nanoid(),
            type: 'OPTION_STOP_LOSS_SELL', // New type
            ticker: optionHolding.underlyingTicker,
            shares: optionHolding.shares,
            price: sellPrice, // Actual execution price
            totalAmount: proceeds,
            timestamp: Date.now(),
            purchasePrice: optionHolding.purchasePrice,
            realizedPnl: realizedPnl,
            optionSymbol: optionHolding.symbol,
            optionType: optionHolding.optionType,
            strikePrice: optionHolding.strikePrice,
            stopLossTriggerPrice: optionHolding.stopLossPrice || undefined, // Record SL price
        };

        const currentPortfolio = portfolioRef.current;
        const currentTransactions = transactionsRef.current;

        // Remove the option holding from the portfolio
        const newOptionHoldings = currentPortfolio.optionHoldings.filter(o => o.symbol !== optionHolding.symbol);
        const newPortfolio: Portfolio = {
            ...currentPortfolio,
            cash: currentPortfolio.cash + proceeds,
            optionHoldings: newOptionHoldings
        };
        const newTransactions = [...currentTransactions, stopLossTransaction];

        try {
            await saveData(newPortfolio, newTransactions);
            showNotification({
                sender: { uid: 'system', displayName: 'System Alert', email: '', photoURL: '', fontSize: 'medium' },
                text: `STOP LOSS executed for ${optionHolding.symbol} @ ${formatCurrency(sellPrice)}. Realized P&L: ${formatCurrency(realizedPnl)}`,
                ticker: optionHolding.underlyingTicker
            });
        } catch (error) {
            console.error(`[STOP LOSS FAILED] Error saving stop loss sale for ${optionHolding.symbol}:`, error);
            // Optionally, show an error notification to the user
        } finally {
            processingStopLossRef.current.delete(optionHolding.symbol); // Unmark as processing
        }
    }, [user, saveData, showNotification]);

    const settleExpiredOptions = (
        currentPortfolio: Portfolio, 
        currentTransactions: Transaction[], 
        stockQuotes: FmpQuote[]
    ): { updatedPortfolio: Portfolio; updatedTransactions: Transaction[]; changed: boolean } => {
        let changed = false;
        let newPortfolio = { ...currentPortfolio };
        let newTransactions = [...currentTransactions];
        const now = Date.now() - (60 * 1000); 

        const unexpiredHoldings: OptionHolding[] = [];

        for (const option of currentPortfolio.optionHoldings) {
            const expiryDate = new Date(option.expirationDate).getTime();
            
            if (expiryDate > now) {
                unexpiredHoldings.push(option);
                continue; 
            }

            changed = true; 
            
            const quote = stockQuotes.find(q => q.symbol === option.underlyingTicker);
            const currentStockPrice = quote?.price || 0;
            const contracts = option.shares;

            let intrinsicValue = 0;
            
            if (option.optionType === 'call') {
                intrinsicValue = Math.max(0, currentStockPrice - option.strikePrice);
            } else if (option.optionType === 'put') {
                intrinsicValue = Math.max(0, option.strikePrice - currentStockPrice);
            }
            
            const settlementPrice = intrinsicValue;
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

    // This useEffect hook handles periodic price updates for all holdings.
    useEffect(() => {
        // FIX: Do not start the update process until the initial portfolio has loaded.
        if (isLoading) {
            return;
        }

        const updateAllPrices = async () => {
             const currentPortfolio = portfolioRef.current;
             const currentTransactions = transactionsRef.current;

             if (!user || (currentPortfolio.holdings.length === 0 && currentPortfolio.optionHoldings.length === 0)) {
                return;
            }

            const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

            try {
                // ... (existing code to fetch quotes, drawings, option chains remains the same) ...
                 const stockTickers = currentPortfolio.holdings.map(h => h.ticker);
                const optionTickers = currentPortfolio.optionHoldings.map(o => o.underlyingTicker);
                const allRelevantTickers = [...new Set([...stockTickers, ...optionTickers])];

                if (allRelevantTickers.length === 0) return;

                const quotePromise = fmpService.getQuote(allRelevantTickers.join(','));
                const drawingsPromises = Promise.all(allRelevantTickers.map(ticker => loadDrawingsFromDB(user, ticker)));

                const [quotes, allDrawings] = await Promise.all([quotePromise, drawingsPromises]);

                 // --- Drawings/Alerts Logic (remains the same) ---
                const drawingsMap = allRelevantTickers.reduce((acc, ticker, index) => {
                    acc[ticker] = allDrawings[index];
                    return acc;
                }, {} as Record<string, SavedDrawing[]>);

                const currentTime = Date.now() / 1000;

                quotes.forEach(quote => {
                    const ticker = quote.symbol;
                    const price = quote.price;
                    const drawings = drawingsMap[ticker] || [];

                    if (drawings.length === 0) return;

                    drawings.forEach(drawing => {
                         const t1 = drawing.p1.time as number;
                         const t2 = drawing.p2.time as number;
                         const p1 = drawing.p1.price;
                         const p2 = drawing.p2.price;

                         const minPrice = Math.min(p1, p2);
                         const maxPrice = Math.max(p1, p2);
                         const minTime = Math.min(t1, t2);
                         const isDrawingActive = minTime <= currentTime;
                         const priceWithinRange = price >= minPrice && price <= maxPrice;


                        if (isDrawingActive && priceWithinRange) {
                            const lastAlertTime = recentAlertsRef.current[ticker] || 0;
                            const now = Date.now();

                            if (now - lastAlertTime > ALERT_COOLDOWN_MS) {
                                showNotification({
                                    sender: { uid: 'system', displayName: 'System Alert', email: '', photoURL: '', fontSize: 'medium' },
                                    text: `Price Alert! ${ticker} entered a saved rectangle (Price: ${formatCurrency(price)})`,
                                    ticker: ticker
                                });
                                recentAlertsRef.current[ticker] = now;
                            }
                        }
                    });
                });


                 // --- Option Chain Fetching (remains the same) ---
                const optionFetchPairs = Array.from(new Set(
                    currentPortfolio.optionHoldings.map(o => `${o.underlyingTicker}_${o.expirationDate}`)
                )).map(pair => {
                    const [ticker, date] = pair.split('_');
                    return { ticker, date };
                });

                const optionChainsResults = await Promise.all(
                     optionFetchPairs.map(pair => getOptionsChain(pair.ticker, pair.date))
                );

                const flatOptionChains = optionChainsResults.flatMap(result => result.contracts);


                let tempPortfolio = { ...currentPortfolio };
                let newTransactions = [...currentTransactions];
                let changed = false;
                const stopLossesToTrigger: OptionHolding[] = []; // Collect options hitting SL

                // --- Update Stock Holdings (remains the same) ---
                 tempPortfolio.holdings = tempPortfolio.holdings.map(holding => {
                    const quote = quotes.find(q => q.symbol === holding.ticker);
                    if (quote && (quote.price !== holding.currentPrice || quote.change !== holding.change)) {
                        changed = true;
                        return {
                            ...holding,
                            currentPrice: quote.price,
                            change: quote.change,
                            changesPercentage: quote.changesPercentage
                        };
                    }
                    return holding;
                });

                // --- Update Option Holdings AND Check Stop Losses ---
                tempPortfolio.optionHoldings = tempPortfolio.optionHoldings.map((option) => {
                     // Find fresh data for this specific option contract
                    const freshOptionData = flatOptionChains.find(o => o.symbol === option.symbol);
                    let updatedOption = { ...option }; // Start with existing data

                    if (freshOptionData) {
                        const newPrice = freshOptionData.close_price;
                         // Check if the price is valid (not null/undefined)
                        if (newPrice !== null && newPrice !== undefined) {
                            const epsilon = 0.0001;
                             // Check if the price has actually changed
                            const isPriceChanged = Math.abs(newPrice - option.currentPrice) > epsilon;

                            if (isPriceChanged) {
                                changed = true; // Mark portfolio as changed if price updated
                                updatedOption = { // Update the option data
                                    ...option,
                                    currentPrice: newPrice,
                                    change: freshOptionData.change || 0,
                                    changesPercentage: freshOptionData.changesPercentage || 0,
                                    delta: freshOptionData.delta,
                                    gamma: freshOptionData.gamma,
                                    theta: freshOptionData.theta,
                                    vega: freshOptionData.vega,
                                    impliedVolatility: freshOptionData.impliedVolatility,
                                    open_interest: freshOptionData.open_interest,
                                    volume: freshOptionData.volume
                                };
                            }

                             // --- ADDED: Stop-Loss Check ---
                             // Check if a stop loss is set and if the new price triggers it
                             if (updatedOption.stopLossPrice !== null && updatedOption.stopLossPrice !== undefined &&
                                 newPrice <= updatedOption.stopLossPrice &&
                                 !processingStopLossRef.current.has(updatedOption.symbol)) // Ensure not already processing
                             {
                                 // Add to trigger list - use the *updated* option data
                                 stopLossesToTrigger.push(updatedOption);
                             }
                            // --- END ADDED ---
                        } else {
                            // Log if fresh data exists but price is null/undefined
                             console.warn(`[UPDATE ALL PRICES] Fresh data found for ${option.symbol}, but close_price is null or undefined.`);
                        }
                    } else {
                         // Log if no fresh data found for an existing holding (might indicate data source issue)
                         console.warn(`[UPDATE ALL PRICES] No fresh option data found for existing holding ${option.symbol}. Price not updated.`);
                    }
                    return updatedOption; // Return the potentially updated option
                });

                // --- Trigger Stop Losses AFTER updating all prices ---
                 if (stopLossesToTrigger.length > 0) {
                     // Use Promise.all to trigger all necessary stop losses concurrently
                     await Promise.all(stopLossesToTrigger.map(optionToSell =>
                         triggerStopLossSell(optionToSell, optionToSell.currentPrice) // Pass the trigger price
                     ));
                     // No need to manually update portfolio/transactions here,
                     // triggerStopLossSell handles saving the updated state after sale.
                     // The next onSnapshot will reflect the removal.
                     // Set 'changed' to false because saveData happens inside triggerStopLossSell
                     changed = false;
                 }


                // --- Settle Expired Options (remains the same) ---
                 // Note: This needs to run *after* potential stop-loss triggers
                 // so we don't try to settle an option that was just stop-loss sold.
                 // We re-fetch the portfolio state from the ref inside settleExpiredOptions
                 // if stop-losses were triggered, otherwise use tempPortfolio.

                 // IMPORTANT: If stop losses were triggered, the portfolio state was potentially updated
                 // inside triggerStopLossSell. We need to use the latest state from the ref.
                const portfolioForSettlement = stopLossesToTrigger.length > 0 ? portfolioRef.current : tempPortfolio;
                const transactionsForSettlement = stopLossesToTrigger.length > 0 ? transactionsRef.current : newTransactions;


                const { updatedPortfolio: settledPortfolio, updatedTransactions: settledTransactions, changed: settledChanged } = settleExpiredOptions(
                    portfolioForSettlement,
                    transactionsForSettlement, // Use potentially updated transactions
                    quotes
                );

                // If stop losses triggered, the portfolio/transactions were already saved.
                // If only settlement happened, update temp vars.
                if (stopLossesToTrigger.length === 0) {
                     tempPortfolio = settledPortfolio;
                     newTransactions = settledTransactions;
                     changed = changed || settledChanged; // Update 'changed' based on settlement
                 } else if (settledChanged) {
                     // If both stop losses AND settlement happened, we need to save the settled state again.
                     await saveData(settledPortfolio, settledTransactions);
                     changed = false; // Mark as saved
                 }


                 // --- Save Data if changes occurred (and not already saved by SL) ---
                if (changed) {
                    await saveData(tempPortfolio, newTransactions);
                }

            } catch (error) {
                console.error("[UPDATE ALL PRICES - FAIL] Failed to update prices or run alerts:", error);
            }
        };

        // ... (rest of the visibility change and interval logic remains the same) ...
        if (document.visibilityState === 'visible') {
            updateAllPrices();
        }

        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                updateAllPrices();
            }
        }, 300000); // Check every 5 minutes

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                updateAllPrices(); // Update immediately when tab becomes visible
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);


        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    // FIX: Add isLoading to dependency array to re-trigger this effect after initial load.
    }, [user, isLoading, showNotification, saveData, triggerStopLossSell]);


    const buyStock = useCallback(async (ticker: string, name: string, shares: number, price: number) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        const currentPortfolio = portfolioRef.current;
        const cost = shares * price;
        if (currentPortfolio.cash < cost) {
            alert("Not enough cash to complete purchase.");
            return;
        }

        const newTransaction: Transaction = {
            id: nanoid(), type: 'BUY', ticker, shares, price, totalAmount: cost, timestamp: Date.now(),
        };
        const newTransactions = [...transactionsRef.current, newTransaction];

        const newHoldings = [...currentPortfolio.holdings];
        const existingHoldingIndex = newHoldings.findIndex(h => h.ticker === ticker);
        if (existingHoldingIndex > -1) {
            const existing = newHoldings[existingHoldingIndex];
            const totalShares = existing.shares + shares;
            const totalCost = (existing.shares * existing.purchasePrice) + cost;
            newHoldings[existingHoldingIndex] = { ...existing, shares: totalShares, purchasePrice: totalCost / totalShares, currentPrice: price };
        } else {
            // FIX: Initialize change and changesPercentage for new holdings
            newHoldings.push({ ticker, name, shares, purchasePrice: price, currentPrice: price, change: 0, changesPercentage: 0 });
        }
        
        const newPortfolio: Portfolio = { ...currentPortfolio, cash: currentPortfolio.cash - cost, holdings: newHoldings };
        await saveData(newPortfolio, newTransactions);
    }, [user, saveData]);

    const sellStock = useCallback(async (ticker: string, shares: number, price: number) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        const currentPortfolio = portfolioRef.current;
        const existingHolding = currentPortfolio.holdings.find(h => h.ticker === ticker);
        if (!existingHolding || existingHolding.shares < shares) {
            alert("You don't own enough shares to sell.");
            return;
        }

        const proceeds = shares * price;
        const realizedPnl = (price - existingHolding.purchasePrice) * shares;

        const newTransaction: Transaction = {
            id: nanoid(), type: 'SELL', ticker, shares, price, totalAmount: proceeds, timestamp: Date.now(), purchasePrice: existingHolding.purchasePrice, realizedPnl,
        };
        const newTransactions = [...transactionsRef.current, newTransaction];

        let newHoldings = [...currentPortfolio.holdings];
        if (existingHolding.shares === shares) {
            newHoldings = newHoldings.filter(h => h.ticker !== ticker);
        } else {
            const holdingIndex = newHoldings.findIndex(h => h.ticker === ticker);
            newHoldings[holdingIndex] = { ...existingHolding, shares: existingHolding.shares - shares };
        }

        const newPortfolio: Portfolio = { ...currentPortfolio, cash: currentPortfolio.cash + proceeds, holdings: newHoldings };
        await saveData(newPortfolio, newTransactions);
    }, [user, saveData]);

    const sellOption = useCallback(async (symbol: string, shares: number, price: number) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        const currentPortfolio = portfolioRef.current;
        const existingOption = currentPortfolio.optionHoldings.find(o => o.symbol === symbol);
        if (!existingOption || existingOption.shares < shares) {
            alert("You don't own enough contracts to sell.");
            return;
        }

        const proceeds = shares * price * 100;
        const realizedPnl = (price - existingOption.purchasePrice) * shares * 100;

        const newTransaction: Transaction = {
            id: nanoid(), type: 'OPTION_SELL', ticker: existingOption.underlyingTicker, shares, price, totalAmount: proceeds, timestamp: Date.now(), purchasePrice: existingOption.purchasePrice, realizedPnl, optionSymbol: existingOption.symbol, optionType: existingOption.optionType, strikePrice: existingOption.strikePrice,
        };
        const newTransactions = [...transactionsRef.current, newTransaction];
        
        let newOptionHoldings = [...currentPortfolio.optionHoldings];
        if (existingOption.shares === shares) {
            newOptionHoldings = newOptionHoldings.filter(o => o.symbol !== symbol);
        } else {
            const optionIndex = newOptionHoldings.findIndex(o => o.symbol === symbol);
            newOptionHoldings[optionIndex] = { ...existingOption, shares: existingOption.shares - shares };
        }

        const newPortfolio: Portfolio = { ...currentPortfolio, cash: currentPortfolio.cash + proceeds, optionHoldings: newOptionHoldings };
        await saveData(newPortfolio, newTransactions);
    }, [user, saveData]);

    const sellAllStock = useCallback(async (ticker: string) => {
        if (!user) {
            alert("You must be logged in to trade.");
            return;
        }
        const currentPortfolio = portfolioRef.current;
        const existingHolding = currentPortfolio.holdings.find(h => h.ticker === ticker);
        if (!existingHolding || existingHolding.shares <= 0) {
            alert("You do not own any shares of this stock to sell.");
            return;
        }
        // Call the existing sellStock function with all shares and the current price
        await sellStock(ticker, existingHolding.shares, existingHolding.currentPrice);
        alert(`Successfully submitted order to sell all ${existingHolding.shares.toFixed(4)} shares of ${ticker}.`);
    }, [user, sellStock]);

    const buyOption = useCallback(async (option: OptionHolding, stopLossPrice?: number | null) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        const currentPortfolio = portfolioRef.current;
        const cost = option.shares * option.purchasePrice * 100;

        if (currentPortfolio.cash < cost) {
            alert("Not enough cash to buy option contract(s).");
            return;
        }

        // Add stopLossPrice to the transaction log? Maybe not necessary here, but keep in holding.
        const newTransaction: Transaction = {
            id: nanoid(), type: 'OPTION_BUY', ticker: option.underlyingTicker, shares: option.shares, price: option.purchasePrice, totalAmount: cost, timestamp: Date.now(), optionSymbol: option.symbol, optionType: option.optionType, strikePrice: option.strikePrice,
        };
        const newTransactions = [...transactionsRef.current, newTransaction];

        const newOptionHoldings = [...currentPortfolio.optionHoldings];
        const existingOptionIndex = newOptionHoldings.findIndex(o => o.symbol === option.symbol);

        // Include stopLossPrice when adding/updating the holding
        const optionWithStopLoss = {
            ...option,
            stopLossPrice: stopLossPrice === undefined ? null : stopLossPrice // Set null if not provided
        };

        if (existingOptionIndex > -1) {
            const existing = newOptionHoldings[existingOptionIndex];
            const totalContracts = existing.shares + optionWithStopLoss.shares;
            const totalCost = (existing.shares * existing.purchasePrice * 100) + cost;
            const newAveragePrice = (totalCost / totalContracts) / 100;

             // When averaging, preserve the *newly entered* stop loss if provided,
             // otherwise keep the existing one (or null if none existed).
            const finalStopLoss = stopLossPrice !== undefined ? stopLossPrice : existing.stopLossPrice;


            newOptionHoldings[existingOptionIndex] = {
                ...existing,
                shares: totalContracts,
                purchasePrice: newAveragePrice,
                currentPrice: optionWithStopLoss.currentPrice, // Update with latest market data
                delta: optionWithStopLoss.delta,
                gamma: optionWithStopLoss.gamma,
                theta: optionWithStopLoss.theta,
                vega: optionWithStopLoss.vega,
                impliedVolatility: optionWithStopLoss.impliedVolatility,
                open_interest: optionWithStopLoss.open_interest,
                volume: optionWithStopLoss.volume,
                stopLossPrice: finalStopLoss, // Preserve/update stop loss
            };
        } else {
            newOptionHoldings.push(optionWithStopLoss);
        }

        const newPortfolio: Portfolio = { ...currentPortfolio, cash: currentPortfolio.cash - cost, optionHoldings: newOptionHoldings };

        await saveData(newPortfolio, newTransactions);
    }, [user, saveData]);

    const manualSellOption = useCallback(async (symbol: string) => {
        const existingOption = portfolioRef.current.optionHoldings.find(o => o.symbol === symbol);
        if (!existingOption) {
            alert("Option contract not found in portfolio.");
            return;
        }
        await sellOption(symbol, existingOption.shares, existingOption.currentPrice);
    }, [sellOption]);

    const updateOptionStopLoss = useCallback(async (symbol: string, newStopLossPrice: number | null) => {
        if (!user) return;
        const currentPortfolio = portfolioRef.current;
        const newOptionHoldings = currentPortfolio.optionHoldings.map(o => {
            if (o.symbol === symbol) {
                console.log(`Updating stop loss for ${symbol} to: ${newStopLossPrice !== null ? formatCurrency(newStopLossPrice) : 'None'}`);
                return { ...o, stopLossPrice: newStopLossPrice };
            }
            return o;
        });

        if (JSON.stringify(newOptionHoldings) !== JSON.stringify(currentPortfolio.optionHoldings)) {
             const newPortfolio: Portfolio = { ...currentPortfolio, optionHoldings: newOptionHoldings };
             // No new transaction is needed for just updating the stop loss
             await saveData(newPortfolio, transactionsRef.current);
        } else {
             console.log(`No change detected for stop loss on ${symbol}.`);
        }
    }, [user, saveData]);

    const totalValue = useMemo(() => {
        const holdingsValue = portfolio.holdings.reduce((acc, h) => acc + (h.shares * h.currentPrice), 0);
        const optionsValue = portfolio.optionHoldings.reduce((acc, o) => acc + (o.shares * o.currentPrice * 100), 0);
        return portfolio.cash + holdingsValue + optionsValue;
    }, [portfolio]);

    // OPTIMIZATION: Memoize the context value to prevent unnecessary re-renders of child components.
    const value = useMemo(() => ({
        portfolio,
        transactions,
        buyStock,
        sellStock,
        sellAllStock,
        buyOption,
        sellOption,
        triggerStopLossSell, // Add the new function
        manualSellOption,
        updateOptionStopLoss, // Add the new function
        totalValue,
        isLoading
    }), [
        portfolio,
        transactions,
        buyStock,
        sellStock,
        sellAllStock,
        buyOption,
        sellOption,
        triggerStopLossSell, // Add dependency
        manualSellOption,
        updateOptionStopLoss, // Add dependency
        totalValue,
        isLoading
    ]);

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