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

export const PortfolioProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [portfolio, setPortfolio] = useState<Portfolio>({
        cash: INITIAL_CASH,
        holdings: [],
        optionHoldings: [], // Add this
        initialValue: INITIAL_CASH,
    });
    const [isLoading, setIsLoading] = useState(true);

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

            // Note: Option price updates would require another API call, skipping for simplicity in paper trading
            // A real app would fetch latest option prices here as well.

            setPortfolio(prev => ({ ...prev, holdings: updatedHoldings }));
        } catch (error) {
            console.error("Failed to update stock prices:", error);
        } finally {
            setIsLoading(false);
        }
    }, [portfolio.holdings]);

    useEffect(() => {
        updateHoldingPrices();
        const interval = setInterval(updateHoldingPrices, 60000); // Update every minute
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
    
    // Add these two functions
    const buyOption = useCallback((option: OptionHolding) => {
        const cost = option.shares * option.purchasePrice * 100; // Each contract is for 100 shares
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
    const context = useContext(PortfolioContext);
    if (context === undefined) {
        throw new Error('usePortfolio must be used within a PortfolioProvider');
    }
    return context;
};