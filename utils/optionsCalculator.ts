// stgisi414/ai-paper-trader/ai-paper-trader-1aba57e32cc684602a69e276de1a20c554fe5223/utils/optionsCalculator.ts

// FIX: Use a wildcard import to access Greeks functions directly as properties
import * as blackScholes from 'black-scholes'; 
import { OptionHolding } from '../types';

// Hardcoded risk-free rate (r) based on 10Y US Treasury Yield (approx 4.16% or 0.0416)
const RISK_FREE_RATE = 0.0416;

/**
 * Calculates the time to expiration (T) in years.
 * @param expirationDate The option's expiration date string (e.g., "2025-10-03").
 * @returns Time to expiration in years.
 */
const calculateTimeToExpiration = (expirationDate: string): number => {
    const today = new Date().getTime();
    // Use `new Date()` on the date string, which correctly parses ISO strings/milliseconds.
    const expiry = new Date(expirationDate).getTime(); 
    const days = (expiry - today) / (1000 * 60 * 60 * 24);
    
    // Use 252 trading days for options closer to expiry, 365 days for far out
    const annualizationFactor = days > 365 ? 365 : 252;
    
    return Math.max(0, days / annualizationFactor);
};

type OptionType = 'call' | 'put';

/**
 * Calculates Greeks for an option contract using the Black-Scholes model.
 * @param optionType 'call' or 'put'.
 * @param S Current stock price.
 * @param K Option strike price.
 * @param expirationDate The option's expiration date string (YYYY-MM-DD).
 * @param IV Implied Volatility (sigma, as a decimal).
 * @returns Object containing the calculated Greeks (delta, gamma, theta, vega, impliedVolatility).
 */
export const calculateGreeks = (
    optionType: OptionType,
    S: number,
    K: number,
    expirationDate: string,
    IV: number | null
): Pick<OptionHolding, 'delta' | 'gamma' | 'theta' | 'vega' | 'impliedVolatility'> => {
    
    if (IV === null || IV <= 0) {
        return { delta: null, gamma: null, theta: null, vega: null, impliedVolatility: IV };
    }
    
    const T = calculateTimeToExpiration(expirationDate);
    
    if (T <= 0) {
        return { delta: null, gamma: null, theta: null, vega: null, impliedVolatility: IV };
    }

    try {
        const type = optionType; 
        const r = RISK_FREE_RATE; 
        const sigma = IV as number; 
        
        // FIX: Use the direct function calls from the wildcard import
        const delta = blackScholes.delta(type, S, K, T, r, sigma);
        const gamma = blackScholes.gamma(S, K, T, r, sigma);
        const thetaAnnualized = blackScholes.theta(type, S, K, T, r, sigma);
        const vega = blackScholes.vega(S, K, T, r, sigma);
        
        // Theta is typically annualized; convert to daily decay
        const thetaDaily = thetaAnnualized / 365;

        return {
            delta: delta,
            gamma: gamma,
            theta: thetaDaily,
            vega: vega,
            impliedVolatility: IV,
        };
    } catch (e) {
        console.error("Black-Scholes calculation failed:", e);
        return { delta: null, gamma: null, theta: null, vega: null, impliedVolatility: IV };
    }
};