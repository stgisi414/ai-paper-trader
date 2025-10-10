import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../src/firebaseConfig'; // <-- CORRECTED PATH
import { useAuth } from '../src/hooks/useAuth.tsx'; //
import type { Portfolio, Holding, OptionHolding, Transaction, FmpQuote } from '../types';
import { INITIAL_CASH } from '../constants';
import * as fmpService from '../services/fmpService';
import { nanoid } from 'nanoid';
import { getOptionsChain } from '../services/optionsProxyService';

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
        /* const updateAllPrices = async () => {
             if (!user || (portfolio.holdings.length === 0 && portfolio.optionHoldings.length === 0)) {
                console.log(`[UPDATE ALL PRICES] Skip: No user or no holdings.`);
                return; // No user or nothing to update
            }
            
            console.log(`[UPDATE ALL PRICES] Starting price refresh...`);
            
            try {
                // Get tickers for all owned stocks
                const stockTickers = portfolio.holdings.map(h => h.ticker);
                
                // Get all unique Ticker + Expiration Date pairs for owned options
                // This is crucial to ensure we fetch the correct option chains
                const optionFetchPairs = Array.from(new Set(
                    portfolio.optionHoldings.map(o => `${o.underlyingTicker}_${o.expirationDate}`)
                )).map(pair => {
                    const [ticker, date] = pair.split('_');
                    return { ticker, date };
                });
                
                // Consolidate all unique tickers (from stocks and options) to fetch stock quotes once
                const allUniqueTickers = [...new Set([...stockTickers, ...optionFetchPairs.map(p => p.ticker)])];

                console.log(`[UPDATE ALL PRICES] Stocks to fetch quotes for: ${allUniqueTickers.join(', ')}`);
                console.log(`[UPDATE ALL PRICES] Option pairs to fetch chains for: ${optionFetchPairs.map(p => `${p.ticker}/${p.date}`).join('; ')}`);

                if (allUniqueTickers.length === 0) return;

                // Fetch all data concurrently
                const [quotes, ...optionChainsResults] = await Promise.all([
                    // 1. Get latest stock prices for all underlying assets
                    fmpService.getQuote(allUniqueTickers.join(',')),
                    // 2. Get option chains for each specific expiration date we own
                    ...optionFetchPairs.map(pair => getOptionsChain(pair.ticker, pair.date))
                ]);
                
                console.log(`[UPDATE ALL PRICES] Finished fetching data. Total option chain results: ${optionChainsResults.length}`);
                
                // Combine all fetched option contracts into one array for easier searching
                const flatOptionChains = optionChainsResults.flatMap(result => result.contracts);
                
                console.log(`[UPDATE ALL PRICES] Total unique option contracts fetched: ${flatOptionChains.length}`);

                
                let tempPortfolio = { ...portfolio };
                let currentTransactions = [...transactions];
                let changed = false;


                // 1. Update stock prices
                tempPortfolio.holdings = tempPortfolio.holdings.map(holding => {
                    const quote = quotes.find(q => q.symbol === holding.ticker);
                    if (quote && quote.price !== holding.currentPrice) {
                        changed = true;
                        return { ...holding, currentPrice: quote.price };
                    }
                    return holding;
                });
                
                // ----------------------------------------------------------------------------------
                // STEP 2: Process Option Holdings (Settlement & Price Update)
                // ----------------------------------------------------------------------------------
                
                // 2a. Settle Expired Options (updates tempPortfolio and currentTransactions)
                const { updatedPortfolio: settledPortfolio, updatedTransactions: settledTransactions, changed: settledChanged } = settleExpiredOptions(
                    tempPortfolio, 
                    currentTransactions, 
                    quotes // Pass all fetched stock quotes
                );
                
                tempPortfolio = settledPortfolio;
                currentTransactions = settledTransactions;
                changed = changed || settledChanged;
                
                // 2b. Update Prices for Remaining Options
                tempPortfolio.optionHoldings = tempPortfolio.optionHoldings.map((option) => {
                    console.log(`[UPDATE HOLDING - OPTION] Processing ${option.symbol}. Purchase: ${option.purchasePrice}, Current (Old): ${option.currentPrice}, Contracts: ${option.shares}`);

                    // Find the specific option contract from our fetched data
                    const freshOptionData = flatOptionChains.find(o => o.symbol === option.symbol);
                    
                    if (freshOptionData) {
                         const newPrice = freshOptionData.close_price;
                         console.log(`[UPDATE HOLDING - OPTION] Fresh Data Found. New Price from API (close_price): ${newPrice}`);

                         if (newPrice !== null && newPrice !== undefined) {
                            
                            // Use a small tolerance (epsilon) for robust floating point comparison
                            const epsilon = 0.0001; 
                            const isPriceChanged = Math.abs(newPrice - option.currentPrice) > epsilon;

                            if (isPriceChanged) {
                                changed = true;
                                console.log(`[UPDATE HOLDING - OPTION] ***PRICE CHANGED***. New Price: ${newPrice}. Updating holding.`);
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
                            } else {
                                console.log(`[UPDATE HOLDING - OPTION] Price is numerically the same (within tolerance). Skipping update.`);
                            }
                        } else {
                            console.log(`[UPDATE HOLDING - OPTION] Fresh Data price is null/undefined. Skipping update for this contract.`);
                        }
                    } else {
                        console.log(`[UPDATE HOLDING - OPTION] No fresh data found in flatOptionChains for contract ${option.symbol}. This suggests a fetching or symbol mismatch issue.`);
                    }
                    return option;
                });

                // If any price changed OR expiration occurred, save the updated portfolio to Firestore
                if (changed) {
                    const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
                    console.log(`[UPDATE ALL PRICES] Changes detected. Saving portfolio to Firestore.`);
                    // We must use 'setDoc' (or 'updateDoc' with specific fields) but since we modified the whole object (holdings, cash, etc.), setDoc is safer.
                    await setDoc(portfolioDocRef, tempPortfolio, { merge: true });
                    // Only update local transactions state if we are saving 
                    setTransactions(currentTransactions);
                } else {
                    console.log(`[UPDATE ALL PRICES] No material changes detected. Skipping Firestore save.`);
                }

            } catch (error) {
                console.error("[UPDATE ALL PRICES - FAIL] Failed to update prices in Firestore:", error);
            }
        };

        updateAllPrices(); // Run once on load
        const interval = setInterval(updateAllPrices, 60000); // Then, refresh every minute
        return () => clearInterval(interval); */

    }, [user, portfolio.holdings, portfolio.optionHoldings, transactions]); // Added transactions dependency to ensure fresh transaction array in the loop


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
