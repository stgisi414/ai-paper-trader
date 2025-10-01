import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import type { Portfolio, Holding, OptionHolding } from '../types';
import { INITIAL_CASH } from '../constants';
import * as fmpService from '../services/fmpService';

interface PortfolioContextType {
    portfolio: Portfolio;
    buyStock: (ticker: string, name: string, shares: number, price: number) => void;
    sellStock: (ticker: string, shares: number, price: number) => void;
    buyOption: (option: OptionHolding) => void;
    sellOption: (symbol: string, shares: number, price: number) => void;
    totalValue: number;
    isLoading: boolean;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

// FIX: Helper function to get the initial portfolio from localStorage
const getInitialPortfolio = (): Portfolio => {
    try {
        const savedPortfolio = localStorage.getItem('ai-paper-trader-portfolio');
        if (savedPortfolio) {
            return JSON.parse(savedPortfolio);
        }
    } catch (error) {
        console.error("Failed to parse portfolio from localStorage", error);
        // If parsing fails, clear the corrupted data
        localStorage.removeItem('ai-paper-trader-portfolio');
    }
    // Return a fresh portfolio if nothing is saved or if there was an error
    return {
        cash: INITIAL_CASH,
        holdings: [],
        optionHoldings: [],
        initialValue: INITIAL_CASH,
    };
};


export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // FIX: Initialize state from the localStorage helper
    const [portfolio, setPortfolio] = useState<Portfolio>(getInitialPortfolio);
    const [isLoading, setIsLoading] = useState(true);
    
    // ADD: useEffect to save the portfolio to localStorage whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem('ai-paper-trader-portfolio', JSON.stringify(portfolio));
        } catch (error) {
            console.error("Failed to save portfolio to localStorage", error);
        }
    }, [portfolio]);


    const updateHoldingPrices = useCallback(async () => {
        // No changes needed in this function
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

    // FIX: Initialize price updates on mount, but don't re-trigger on every portfolio change
    useEffect(() => {
        updateHoldingPrices();
        const interval = setInterval(updateHoldingPrices, 60000);
        return () => clearInterval(interval);
    }, []); 

    const buyStock = useCallback((ticker: string, name: string, shares: number, price: number) => {
        // No changes needed in this function
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
            return { ...prev, cash: prev.cash - cost, holdings: newHoldings };
        });
    }, [portfolio.cash]);

    const sellStock = useCallback((ticker: string, shares: number, price: number) => {
        // No changes needed in this function
        setPortfolio(prev => {
            const existingHoldingIndex = prev.holdings.findIndex(h => h.ticker === ticker);
            if (existingHoldingIndex === -1) return prev;

            const existing = prev.holdings[existingHoldingIndex];
            if (existing.shares < shares) {
                alert("You don't own enough shares to sell.");
                return prev;
            }

            const proceeds = shares * price;
            let newHoldings = [...prev.holdings];
            if (existing.shares === shares) {
                newHoldings.splice(existingHoldingIndex, 1);
            } else {
                newHoldings[existingHoldingIndex] = {
                    ...existing,
                    shares: existing.shares - shares
                };
            }
            return { ...prev, cash: prev.cash + proceeds, holdings: newHoldings };
        });
    }, []);
    
    const buyOption = useCallback((option: OptionHolding) => {
        // No changes needed in this function
        const cost = option.shares * option.purchasePrice * 100;
        if (portfolio.cash < cost) {
            alert("Not enough cash to complete option purchase.");
            return;
        }

        setPortfolio(prev => {
            const newOptionHoldings = [...prev.optionHoldings, option];
            return { ...prev, cash: prev.cash - cost, optionHoldings: newOptionHoldings };
        });
    }, [portfolio.cash]);

    const sellOption = useCallback((symbol: string, shares: number, price: number) => {
        // No changes needed in this function
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
            let newOptionHoldings = [...prev.optionHoldings];
            if (existing.shares === shares) {
                newOptionHoldings.splice(existingOptionIndex, 1);
            } else {
                newOptionHoldings[existingOptionIndex] = {
                    ...existing,
                    shares: existing.shares - shares,
                };
            }
            return { ...prev, cash: prev.cash + proceeds, optionHoldings: newOptionHoldings };
        });
    }, []);


    const totalValue = useMemo(() => {
        // No changes needed in this function
        const holdingsValue = portfolio.holdings.reduce((acc, h) => acc + (h.shares * h.currentPrice), 0);
        const optionsValue = portfolio.optionHoldings.reduce((acc, o) => acc + (o.shares * o.currentPrice * 100), 0);
        return portfolio.cash + holdingsValue + optionsValue;
    }, [portfolio]);

    const value = { portfolio, buyStock, sellStock, buyOption, sellOption, totalValue, isLoading };

    return (
        <PortfolioContext.Provider value={value}>
            {children}
        </PortfolioContext.Provider>
    );
};

export const usePortfolio = (): PortfolioContextType => {
    // No changes needed in this function
    const context = useContext(PortfolioContext);
    if (context === undefined) {
        throw new Error('usePortfolio must be used within a PortfolioProvider');
    }
    return context;
};