import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../src/firebaseConfig';
import { useAuth } from '../src/hooks/useAuth.tsx';
import type { Portfolio, Holding, OptionHolding, Transaction } from '../types';
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
            // Existing logic to reset state for logged-out users
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

    // This useEffect hook handles periodic price updates for all holdings
    useEffect(() => {
        const updateAllPrices = async () => {
             if (!user || (portfolio.holdings.length === 0 && portfolio.optionHoldings.length === 0)) {
                return; // No user or nothing to update
            }
            
            try {
                const stockTickers = portfolio.holdings.map(h => h.ticker);
                const optionUnderlyingTickers = [...new Set(portfolio.optionHoldings.map(o => o.underlyingTicker))];
                const allTickers = [...new Set([...stockTickers, ...optionUnderlyingTickers])];

                if (allTickers.length === 0) return;

                const [quotes, ...optionChains] = await Promise.all([
                    fmpService.getQuote(allTickers.join(',')),
                    ...optionUnderlyingTickers.map(ticker => getOptionsChain(ticker))
                ]);
                
                const flatOptionChains = optionChains.flat();
                
                const updatedPortfolio = { ...portfolio };
                let changed = false;

                updatedPortfolio.holdings = updatedPortfolio.holdings.map(holding => {
                    const quote = quotes.find(q => q.symbol === holding.ticker);
                    if (quote && quote.price !== holding.currentPrice) {
                        changed = true;
                        return { ...holding, currentPrice: quote.price };
                    }
                    return holding;
                });

                updatedPortfolio.optionHoldings = updatedPortfolio.optionHoldings.map(option => {
                    const freshOptionData = flatOptionChains.find(o => o.symbol === option.symbol);
                    if (freshOptionData && freshOptionData.close_price !== null && freshOptionData.close_price !== option.currentPrice) {
                        changed = true;
                        return { ...option, currentPrice: freshOptionData.close_price };
                    }
                    return option;
                });

                if (changed) {
                    const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
                    await setDoc(portfolioDocRef, updatedPortfolio, { merge: true });
                }

            } catch (error) {
                console.error("Failed to update prices in Firestore:", error);
            }
        };

        updateAllPrices(); // Initial update
        const interval = setInterval(updateAllPrices, 60000); // Update every minute
        return () => clearInterval(interval);

    }, [user, portfolio.holdings, portfolio.optionHoldings]);


    // Centralized function to save data to Firestore
    const saveData = async (newPortfolio: Portfolio, newTransactions: Transaction[]) => {
        if (!user) return;
        const portfolioDocRef = doc(db, 'users', user.uid, 'data', 'portfolio');
        const transactionsDocRef = doc(db, 'users', user.uid, 'data', 'transactions');
        await setDoc(portfolioDocRef, newPortfolio);
        await setDoc(transactionsDocRef, { transactions: newTransactions });
    };

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

    const buyOption = useCallback(async (option: OptionHolding) => {
        if (!user) { alert("You must be logged in to trade."); return; }
        const cost = option.shares * option.purchasePrice * 100;
        if (portfolio.cash < cost) {
            alert("Not enough cash to complete option purchase.");
            return;
        }

        const newTransaction: Transaction = {
            id: nanoid(), type: 'OPTION_BUY', ticker: option.underlyingTicker, shares: option.shares, price: option.purchasePrice, totalAmount: cost, timestamp: Date.now(), optionSymbol: option.symbol, optionType: option.optionType, strikePrice: option.strikePrice,
        };
        const newTransactions = [...transactions, newTransaction];
        
        const newPortfolio: Portfolio = { ...portfolio, cash: portfolio.cash - cost, optionHoldings: [...portfolio.optionHoldings, option] };
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

    const totalValue = useMemo(() => {
        const holdingsValue = portfolio.holdings.reduce((acc, h) => acc + (h.shares * h.currentPrice), 0);
        const optionsValue = portfolio.optionHoldings.reduce((acc, o) => acc + (o.shares * o.currentPrice * 100), 0);
        return portfolio.cash + holdingsValue + optionsValue;
    }, [portfolio]);

    const value = { portfolio, transactions, buyStock, sellStock, buyOption, sellOption, totalValue, isLoading };

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
