// stgisi414/ai-paper-trader/ai-paper-trader-1aba57e32cc684602a69e276de1a20c554fe5223/utils/optionsCalculator.ts

// FIX 1: Change to a default import to correctly load the CommonJS module.
// We expect the module export to be { blackScholes: ... }
import { delta, gamma, theta, vega } from 'options-greeks'; 
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
        // ADDED: Continuous dividend yield (Q), assuming zero as data is not available.
        const Q = 0; 
        
        // FIX 2: Use the explicitly imported functions with correct parameter order.
        const calculatedDelta = delta(S, K, T, r, sigma, type, Q);
        const calculatedGamma = gamma(S, K, T, r, sigma, type, Q);
        const calculatedThetaAnnualized = theta(S, K, T, r, sigma, type, Q);
        const calculatedVega = vega(S, K, T, r, sigma, type, Q);
        
        // Theta is typically annualized; convert to daily decay
        const thetaDaily = calculatedThetaAnnualized / 365;

        return {
            delta: calculatedDelta,
            gamma: calculatedGamma,
            theta: thetaDaily,
            vega: calculatedVega,
            impliedVolatility: IV,
        };
    } catch (e) {
        console.error("Black-Scholes calculation failed:", e);
        return { delta: null, gamma: null, theta: null, vega: null, impliedVolatility: IV };
    }
};