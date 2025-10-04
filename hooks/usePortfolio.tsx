import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { Portfolio, Holding, OptionHolding, Transaction } from '../types';
import { INITIAL_CASH } from '../constants';
import * as fmpService from '../services/fmpService';
import { nanoid } from 'nanoid';

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

const getInitialPortfolio = (): Portfolio => {
    try {
        const savedPortfolio = localStorage.getItem('ai-paper-trader-portfolio');
        if (savedPortfolio) {
            return JSON.parse(savedPortfolio);
        }
    } catch (error) {
        console.error("Failed to parse portfolio from localStorage", error);
        localStorage.removeItem('ai-paper-trader-portfolio');
    }
    return {
        cash: INITIAL_CASH,
        holdings: [],
        optionHoldings: [],
        initialValue: INITIAL_CASH,
    };
};

const getInitialTransactions = (): Transaction[] => {
    try {
        const savedTransactions = localStorage.getItem('ai-paper-trader-transactions');
        if (savedTransactions) {
            return JSON.parse(savedTransactions);
        }
    } catch (error) {
        console.error("Failed to parse transactions from localStorage", error);
        localStorage.removeItem('ai-paper-trader-transactions');
    }
    return [];
};

export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [portfolio, setPortfolio] = useState<Portfolio>(getInitialPortfolio);
    const [transactions, setTransactions] = useState<Transaction[]>(getInitialTransactions);
    const [isLoading, setIsLoading] = useState(true);
    
    useEffect(() => {
        try {
            localStorage.setItem('ai-paper-trader-portfolio', JSON.stringify(portfolio));
        } catch (error) {
            console.error("Failed to save portfolio to localStorage", error);
        }
    }, [portfolio]);

    useEffect(() => {
        try {
            localStorage.setItem('ai-paper-trader-transactions', JSON.stringify(transactions));
        } catch (error) {
            console.error("Failed to save transactions to localStorage", error);
        }
    }, [transactions]);

    const updateHoldingPrices = useCallback(async () => {
        if (portfolio.holdings.length === 0) {
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const tickers = portfolio.holdings.map(h => h.ticker).join(',');
            const quotes = await fmpService.getQuote(tickers);
            
            const updatedHoldings = portfolio.holdings.map(holding => {
                const quote = quotes.find(q => q.symbol === holding.ticker);
                return { ...holding, currentPrice: quote ? quote.price : holding.currentPrice };
            });

            setPortfolio(prev => ({ ...prev, holdings: updatedHoldings }));
        } catch (error) {
            console.error("Failed to update stock prices:", error);
        } finally {
            setIsLoading(false);
        }
    }, [portfolio.holdings]);
    
    const handleExpiredOptions = useCallback(async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set to start of day for comparison

        const expiredOptions = portfolio.optionHoldings.filter(o => new Date(o.expirationDate) < today);

        if (expiredOptions.length === 0) return;

        console.log("Processing expired options:", expiredOptions);

        const underlyingTickers = [...new Set(expiredOptions.map(o => o.underlyingTicker))];
        const quotes = await fmpService.getQuote(underlyingTickers.join(','));

        setPortfolio(prev => {
            let newCash = prev.cash;
            let newHoldings = [...prev.holdings];
            const newTransactions: Transaction[] = [];

            const remainingOptionHoldings = prev.optionHoldings.filter(
                o => !expiredOptions.find(eo => eo.symbol === o.symbol)
            );

            expiredOptions.forEach(option => {
                const quote = quotes.find(q => q.symbol === option.underlyingTicker);
                if (!quote) return; // Skip if we can't get a quote

                const stockPriceAtExpiry = quote.price;
                const isITM = option.optionType === 'call' 
                    ? stockPriceAtExpiry > option.strikePrice 
                    : stockPriceAtExpiry < option.strikePrice;

                if (isITM) {
                    const sharesToTransact = option.shares * 100;
                    const transactionCost = sharesToTransact * option.strikePrice;
                    const existingHoldingIndex = newHoldings.findIndex(h => h.ticker === option.underlyingTicker);

                    if (option.optionType === 'call') { // Exercise call: Buy shares
                        newCash -= transactionCost;
                        if (existingHoldingIndex > -1) {
                            const existing = newHoldings[existingHoldingIndex];
                            const totalShares = existing.shares + sharesToTransact;
                            const totalCost = (existing.shares * existing.purchasePrice) + transactionCost;
                            newHoldings[existingHoldingIndex] = { ...existing, shares: totalShares, purchasePrice: totalCost / totalShares };
                        } else {
                            newHoldings.push({ ticker: option.underlyingTicker, name: quote.name, shares: sharesToTransact, purchasePrice: option.strikePrice, currentPrice: stockPriceAtExpiry });
                        }
                    } else { // Exercise put: Sell shares
                        newCash += transactionCost;
                        if (existingHoldingIndex === -1 || newHoldings[existingHoldingIndex].shares < sharesToTransact) {
                           console.error(`Attempted to exercise PUT for ${option.symbol} but not enough shares owned.`);
                           return; // Skip if not enough shares to sell
                        }
                        const existing = newHoldings[existingHoldingIndex];
                        newHoldings[existingHoldingIndex] = { ...existing, shares: existing.shares - sharesToTransact };
                         if (newHoldings[existingHoldingIndex].shares === 0) {
                            newHoldings.splice(existingHoldingIndex, 1);
                        }
                    }
                    
                    newTransactions.push({
                        id: nanoid(),
                        type: 'OPTION_EXERCISE',
                        ticker: option.underlyingTicker,
                        shares: option.shares,
                        price: option.strikePrice,
                        totalAmount: transactionCost,
                        timestamp: Date.now(),
                        optionSymbol: option.symbol,
                        realizedPnl: (stockPriceAtExpiry - option.strikePrice) * (option.optionType === 'call' ? 1 : -1) * 100 * option.shares - (option.purchasePrice * 100 * option.shares)
                    });

                } else { // OTM
                    newTransactions.push({
                        id: nanoid(),
                        type: 'OPTION_EXPIRE',
                        ticker: option.underlyingTicker,
                        shares: option.shares,
                        price: 0,
                        totalAmount: 0,
                        timestamp: Date.now(),
                        optionSymbol: option.symbol,
                        realizedPnl: -(option.purchasePrice * 100 * option.shares) // Full loss of premium
                    });
                }
            });

            if (newTransactions.length > 0) {
                setTransactions(prevT => [...prevT, ...newTransactions]);
            }

            return { ...prev, cash: newCash, holdings: newHoldings, optionHoldings: remainingOptionHoldings };
        });
    }, [portfolio.optionHoldings]);


    useEffect(() => {
        updateHoldingPrices();
        handleExpiredOptions(); // Run on initial load
        const priceInterval = setInterval(updateHoldingPrices, 60000);
        const expiryInterval = setInterval(handleExpiredOptions, 60000); // Check every minute
        return () => {
            clearInterval(priceInterval);
            clearInterval(expiryInterval);
        }
    }, []); 

    const buyStock = useCallback((ticker: string, name: string, shares: number, price: number) => {
        const cost = shares * price;
        if (portfolio.cash < cost) {
            alert("Not enough cash to complete purchase.");
            return;
        }

        setPortfolio(prev => {
            const existingHoldingIndex = prev.holdings.findIndex(h => h.ticker === ticker);
            let newHoldings = [...prev.holdings];

            if (existingHoldingIndex > -1) {
                const existing = newHoldings[existingHoldingIndex];
                const totalShares = existing.shares + shares;
                const totalCost = (existing.shares * existing.purchasePrice) + cost;
                newHoldings[existingHoldingIndex] = {
                    ...existing,
                    shares: totalShares,
                    purchasePrice: totalCost / totalShares,
                };
            } else {
                newHoldings.push({ ticker, name, shares, purchasePrice: price, currentPrice: price });
            }
            
            const newTransaction: Transaction = {
                id: nanoid(),
                type: 'BUY',
                ticker,
                shares,
                price,
                totalAmount: cost,
                timestamp: Date.now(),
            };
            setTransactions(prevT => [...prevT, newTransaction]);

            return { ...prev, cash: prev.cash - cost, holdings: newHoldings };
        });
    }, [portfolio.cash]);

    const sellStock = useCallback((ticker: string, shares: number, price: number) => {
        setPortfolio(prev => {
            const existingHoldingIndex = prev.holdings.findIndex(h => h.ticker === ticker);
            if (existingHoldingIndex === -1) return prev;

            const existing = prev.holdings[existingHoldingIndex];
            if (existing.shares < shares) {
                alert("You don't own enough shares to sell.");
                return prev;
            }

            const proceeds = shares * price;
            const costBasis = shares * existing.purchasePrice;
            const realizedPnl = proceeds - costBasis;

            let newHoldings = [...prev.holdings];
            if (existing.shares === shares) {
                newHoldings.splice(existingHoldingIndex, 1);
            } else {
                newHoldings[existingHoldingIndex] = {
                    ...existing,
                    shares: existing.shares - shares
                };
            }
            
            const newTransaction: Transaction = {
                id: nanoid(),
                type: 'SELL',
                ticker,
                shares,
                price,
                totalAmount: proceeds,
                timestamp: Date.now(),
                purchasePrice: existing.purchasePrice,
                realizedPnl: realizedPnl,
            };
            setTransactions(prevT => [...prevT, newTransaction]);

            return { ...prev, cash: prev.cash + proceeds, holdings: newHoldings };
        });
    }, []);
    
    const buyOption = useCallback((option: OptionHolding) => {
        const cost = option.shares * option.purchasePrice * 100;
        if (portfolio.cash < cost) {
            alert("Not enough cash to complete option purchase.");
            return;
        }

        setPortfolio(prev => {
            const newOptionHoldings = [...prev.optionHoldings, option];
            
            const newTransaction: Transaction = {
                id: nanoid(),
                type: 'OPTION_BUY',
                ticker: option.underlyingTicker,
                shares: option.shares,
                price: option.purchasePrice,
                totalAmount: cost,
                timestamp: Date.now(),
                optionSymbol: option.symbol,
                optionType: option.optionType,
                strikePrice: option.strikePrice,
            };
            setTransactions(prevT => [...prevT, newTransaction]);

            return { ...prev, cash: prev.cash - cost, optionHoldings: newOptionHoldings };
        });
    }, [portfolio.cash]);

    const sellOption = useCallback((symbol: string, shares: number, price: number) => {
        setPortfolio(prev => {
            const existingOptionIndex = prev.optionHoldings.findIndex(o => o.symbol === symbol);

            if (existingOptionIndex === -1) {
                alert("You do not own this option contract.");
                return prev;
            }

            const existing = prev.optionHoldings[existingOptionIndex];
            if (existing.shares < shares) {
                alert("You don't own enough contracts to sell.");
                return prev;
            }

            const proceeds = shares * price * 100;
            const costBasis = shares * existing.purchasePrice * 100;
            const realizedPnl = proceeds - costBasis;

            let newOptionHoldings = [...prev.optionHoldings];
            if (existing.shares === shares) {
                newOptionHoldings.splice(existingOptionIndex, 1);
            } else {
                newOptionHoldings[existingOptionIndex] = {
                    ...existing,
                    shares: existing.shares - shares,
                };
            }

            const newTransaction: Transaction = {
                id: nanoid(),
                type: 'OPTION_SELL',
                ticker: existing.underlyingTicker,
                shares: shares,
                price: price,
                totalAmount: proceeds,
                timestamp: Date.now(),
                purchasePrice: existing.purchasePrice,
                realizedPnl: realizedPnl,
                optionSymbol: existing.symbol,
                optionType: existing.optionType,
                strikePrice: existing.strikePrice,
            };
            setTransactions(prevT => [...prevT, newTransaction]);

            return { ...prev, cash: prev.cash + proceeds, optionHoldings: newOptionHoldings };
        });
    }, []);


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