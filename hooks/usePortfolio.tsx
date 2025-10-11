import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
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
    buyOption: (option: OptionHolding) => void;
    sellOption: (symbol: string, shares: number, price: number) => void;
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

    const portfolioRef = useRef(portfolio);
    useEffect(() => {
        portfolioRef.current = portfolio;
    }, [portfolio]);

    const transactionsRef = useRef(transactions);
    useEffect(() => {
        transactionsRef.current = transactions;
    }, [transactions]);

    useEffect(() => {
        if (!user) {
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

        // Set loading to true when user changes
        setIsLoading(true);
        const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
        const transactionsDocRef = doc(db, 'users', user.uid, 'data', 'transactions');

        const unsubPortfolio = onSnapshot(portfolioDocRef, (doc) => {
            if (doc.exists()) {
                setPortfolio(doc.data() as Portfolio);
            } else {
                const initialPortfolio = {
                    cash: INITIAL_CASH,
                    holdings: [],
                    optionHoldings: [],
                    initialValue: INITIAL_CASH,
                };
                setDoc(portfolioDocRef, initialPortfolio);
                setPortfolio(initialPortfolio);
            }
            // Set loading to false only after the first data snapshot
            setIsLoading(false);
        }, (error) => { // ADD THIS ERROR HANDLER
            console.error("Error fetching portfolio:", error);
            setIsLoading(false);
        });
        
        const unsubTransactions = onSnapshot(transactionsDocRef, (doc) => {
            if (doc.exists()) {
                setTransactions(doc.data().transactions || []);
            } else {
                 setDoc(transactionsDocRef, { transactions: [] });
            }
        });

        return () => {
            unsubPortfolio();
            unsubTransactions();
        };
    }, [user]);

    const saveData = useCallback(async (newPortfolio: Portfolio, newTransactions: Transaction[]) => {
        if (!user) return;
        const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
        const transactionsDocRef = doc(db, 'users', user.uid, 'data', 'transactions');
        await setDoc(portfolioDocRef, newPortfolio);
        await setDoc(transactionsDocRef, { transactions: newTransactions });
    }, [user]);


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
            
            try {
                const stockTickers = currentPortfolio.holdings.map(h => h.ticker);
                const optionTickers = currentPortfolio.optionHoldings.map(o => o.underlyingTicker);
                const allRelevantTickers = [...new Set([...stockTickers, ...optionTickers])];
                
                if (allRelevantTickers.length === 0) return;

                const quotePromise = fmpService.getQuote(allRelevantTickers.join(','));
                const drawingsPromises = Promise.all(allRelevantTickers.map(ticker => loadDrawingsFromDB(user, ticker)));
                
                const [quotes, allDrawings] = await Promise.all([quotePromise, drawingsPromises]);

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
                        const maxTime = Math.max(t1, t2);

                        const isFutureBox = maxTime > currentTime;
                        const priceCrossed = price >= minPrice && price <= maxPrice;

                        if (isFutureBox && priceCrossed) {
                            showNotification({
                                sender: { uid: 'system', displayName: 'System Alert', email: '', photoURL: '' },
                                text: `Price Alert! ${ticker} just entered the range of a saved rectangle (Price: ${formatCurrency(price)}, Range: ${formatCurrency(minPrice)} - ${formatCurrency(maxPrice)})`
                            });
                        }
                    });
                });
                
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

                tempPortfolio.holdings = tempPortfolio.holdings.map(holding => {
                    const quote = quotes.find(q => q.symbol === holding.ticker);
                    if (quote && quote.price !== holding.currentPrice) {
                        changed = true;
                        return { ...holding, currentPrice: quote.price };
                    }
                    return holding;
                });
                
                const { updatedPortfolio: settledPortfolio, updatedTransactions: settledTransactions, changed: settledChanged } = settleExpiredOptions(
                    tempPortfolio, 
                    newTransactions, 
                    quotes
                );
                
                tempPortfolio = settledPortfolio;
                newTransactions = settledTransactions;
                changed = changed || settledChanged;
                
                tempPortfolio.optionHoldings = tempPortfolio.optionHoldings.map((option) => {
                    const freshOptionData = flatOptionChains.find(o => o.symbol === option.symbol);
                    
                    if (freshOptionData) {
                         const newPrice = freshOptionData.close_price;
                         
                         if (newPrice !== null && newPrice !== undefined) {
                            const epsilon = 0.0001; 
                            const isPriceChanged = Math.abs(newPrice - option.currentPrice) > epsilon;

                            if (isPriceChanged) {
                                changed = true;
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

                if (changed) {
                    await saveData(tempPortfolio, newTransactions);
                }

            } catch (error) {
                console.error("[UPDATE ALL PRICES - FAIL] Failed to update prices or run alerts:", error);
            }
        };
        
        if (document.visibilityState === 'visible') {
            updateAllPrices();
        }

        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                updateAllPrices();
            }
        }, 300000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                updateAllPrices();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    // FIX: Add isLoading to dependency array to re-trigger this effect after initial load.
    }, [user, isLoading, showNotification, saveData]); 


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
            newHoldings.push({ ticker, name, shares, purchasePrice: price, currentPrice: price });
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

    const buyOption = useCallback(async (option: OptionHolding) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        const currentPortfolio = portfolioRef.current;
        const cost = option.shares * option.purchasePrice * 100;
        
        if (currentPortfolio.cash < cost) {
            alert("Not enough cash to buy option contract(s).");
            return;
        }
        
        const newTransaction: Transaction = {
            id: nanoid(), type: 'OPTION_BUY', ticker: option.underlyingTicker, shares: option.shares, price: option.purchasePrice, totalAmount: cost, timestamp: Date.now(), optionSymbol: option.symbol, optionType: option.optionType, strikePrice: option.strikePrice,
        };
        const newTransactions = [...transactionsRef.current, newTransaction];
        
        const newPortfolio: Portfolio = { ...currentPortfolio, cash: currentPortfolio.cash - cost, optionHoldings: [...currentPortfolio.optionHoldings, option] };
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
        buyOption, 
        sellOption, 
        manualSellOption, 
        totalValue, 
        isLoading 
    }), [
        portfolio, 
        transactions, 
        buyStock, 
        sellStock, 
        buyOption, 
        sellOption, 
        manualSellOption, 
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