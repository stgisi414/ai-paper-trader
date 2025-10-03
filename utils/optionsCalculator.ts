// stgisi414/ai-paper-trader/ai-paper-trader-62753196656f768778662c9bd1a539920868b6d1/utils/optionsCalculator.ts

import { OptionHolding } from '../types';

// Hardcoded risk-free rate (r) based on 10Y US Treasury Yield (approx 4.16% or 0.0416)
const RISK_FREE_RATE = 0.0416;
// Assuming zero dividend yield, as stock data does not provide it consistently
const DIVIDEND_YIELD = 0.0; 

/**
 * Calculates the time to expiration (T) in years.
 * @param expirationDate The option's expiration date string (e.g., "2025-10-03").
 * @returns Time to expiration in years.
 */
const calculateTimeToExpiration = (expirationDate: string): number => {
    const today = new Date().getTime();
    const expiry = new Date(expirationDate).getTime(); 
    const days = (expiry - today) / (1000 * 60 * 60 * 24);
    // Use 252 trading days for options closer to expiry, 365 days for far out
    const annualizationFactor = days > 365 ? 365 : 252;
    return Math.max(0, days / annualizationFactor);
};

// --- Black-Scholes Model: Pure JavaScript Implementation ---

// Standard Normal CDF (Cumulative Distribution Function)
const normCDF = (x: number): number => {
    // Uses the formula from Abramowitz and Stegun
    const a1 = 0.31938153;
    const a2 = -0.356563782;
    const a3 = 1.781477937;
    const a4 = -1.821255978;
    const a5 = 1.330274429;
    const gamma = 0.2316419;
    const invSqrt2Pi = 0.3989422804014327; // 1/sqrt(2*pi)

    const L = Math.abs(x);
    const K_val = 1.0 / (1.0 + gamma * L);
    const w = K_val * (a1 + K_val * (a2 + K_val * (a3 + K_val * (a4 + K_val * a5))));

    const N = 1.0 - invSqrt2Pi * Math.exp(-L * L / 2.0) * w;

    if (x < 0) {
        return 1.0 - N;
    }
    return N;
};

// Standard Normal PDF (Probability Density Function)
const normPDF = (x: number): number => {
    return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
};

// Calculates d1 for Black-Scholes formula
const calculateD1 = (S: number, K: number, T: number, r: number, q: number, sigma: number): number => {
    return (Math.log(S / K) + (r - q + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
};

// Main Black-Scholes Greeks Calculator
const calculateBlackScholesGreeks = (
    optionType: 'call' | 'put',
    S: number, // Current stock price
    K: number, // Strike price
    T: number, // Time to expiration (in years)
    r: number, // Risk-free rate
    q: number, // Dividend yield (0.0)
    sigma: number // Implied volatility
): { delta: number, gamma: number, theta: number, vega: number } => {
    const d1 = calculateD1(S, K, T, r, q, sigma);
    const d2 = d1 - sigma * Math.sqrt(T);
    const CND1 = normCDF(d1);
    const CND2 = normCDF(d2);
    const PND1 = normPDF(d1);
    
    const exp_qt = Math.exp(-q * T);
    const exp_rt = Math.exp(-r * T);

    // Delta (with dividend yield)
    const delta = optionType === 'call' ? exp_qt * CND1 : exp_qt * (CND1 - 1);

    // Gamma (with dividend yield)
    const gamma = (PND1 * exp_qt) / (S * sigma * Math.sqrt(T));

    // Theta (per year, convert to per day)
    let thetaAnnual = 
        (-S * PND1 * sigma * exp_qt / (2 * Math.sqrt(T)))
        - (r * K * exp_rt * (optionType === 'call' ? CND2 : 1 - CND2))
        + (q * S * exp_qt * (optionType === 'call' ? CND1 : 1 - CND1));

    // Theta per day
    const theta = thetaAnnual / 365; 

    // Vega (with dividend yield)
    const vega = S * PND1 * Math.sqrt(T) * exp_qt / 100; // Divide by 100 for market convention

    return { delta, gamma, theta, vega };
};

export type OptionType = 'call' | 'put';

/**
 * Calculates Greeks for an option contract using the Black-Scholes model (Client-Side).
 */
export const calculateGreeks = (
    optionType: OptionType,
    S: number,
    K: number,
    expirationDate: string,
    IV: number | null
): Pick<OptionHolding, 'delta' | 'gamma' | 'theta' | 'vega' | 'impliedVolatility'> => {
    
    const T = calculateTimeToExpiration(expirationDate);
    
    if (IV === null || IV <= 0 || T <= 0) {
        return { delta: null, gamma: null, theta: null, vega: null, impliedVolatility: IV };
    }

    try {
        const sigma = IV as number; 
        
        const greeks = calculateBlackScholesGreeks(
            optionType,
            S,
            K,
            T,
            RISK_FREE_RATE,
            DIVIDEND_YIELD,
            sigma
        );

        return {
            delta: greeks.delta,
            gamma: greeks.gamma,
            theta: greeks.theta,
            vega: greeks.vega,
            impliedVolatility: IV,
        };
    } catch (e) {
        console.error("Client-side Black-Scholes calculation failed (Check inputs S, K, T, IV):", e);
        return { delta: null, gamma: null, theta: null, vega: null, impliedVolatility: IV };
    }
};