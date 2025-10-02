// stgisi414/ai-paper-trader/ai-paper-trader-1aba57e32cc684602a69e276de1a20c554fe5223/utils/optionsCalculator.ts

// FIX 1: Import all necessary QuantLib functionality
import * as ql from 'quantlib'; 
import { OptionHolding } from '../types';

// Hardcoded risk-free rate (r) based on 10Y US Treasury Yield (approx 4.16% or 0.0416)
const RISK_FREE_RATE = 0.0416;
// ADDED: Assuming zero dividend yield, as stock data does not provide it consistently
const DIVIDEND_YIELD = 0.0;

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
    
    const T = calculateTimeToExpiration(expirationDate);
    
    if (IV === null || IV <= 0 || T <= 0) {
        return { delta: null, gamma: null, theta: null, vega: null, impliedVolatility: IV };
    }

    try {
        const sigma = IV as number; 
        
        // --- QUANTLIB SETUP ---

        // 1. Set Evaluation Date
        const now = new Date();
        const today = new ql.Date(now.getDate(), now.getMonth() + 1, now.getFullYear());
        ql.Settings.instance().evaluationDate = today;

        // 2. Market Data Quotes
        const underlyingQuote = new ql.QuoteHandle(new ql.SimpleQuote(S));
        const riskFreeRateQuote = new ql.QuoteHandle(new ql.SimpleQuote(RISK_FREE_RATE));
        const volatilityQuote = new ql.QuoteHandle(new ql.SimpleQuote(sigma));
        const dividendYieldQuote = new ql.QuoteHandle(new ql.SimpleQuote(DIVIDEND_YIELD));

        // 3. Term Structures (Curves) - Using Actual/365Fixed for simple models
        const dayCounter = new ql.Actual365Fixed();
        const calendar = new ql.NullCalendar(); // Simplifies day counting for options

        const riskFreeCurve = new ql.YieldTermStructureHandle(
            new ql.FlatForward(today, riskFreeRateQuote, dayCounter)
        );
        const dividendCurve = new ql.YieldTermStructureHandle(
            new ql.FlatForward(today, dividendYieldQuote, dayCounter)
        );
        const volatilityTermStructure = new ql.BlackVolTermStructureHandle(
            new ql.BlackConstantVol(today, calendar, volatilityQuote, dayCounter)
        );

        // 4. Stochastic Process
        const process = new ql.BlackScholesMertonProcess(
            underlyingQuote,
            dividendCurve, // Dividend yield term structure
            riskFreeCurve, // Risk-free rate term structure
            volatilityTermStructure // Volatility term structure
        );

        // 5. Option Definition
        const dateParts = expirationDate.split('-').map(Number); // [YYYY, MM, DD]
        const maturityDate = new ql.Date(dateParts[2], dateParts[1], dateParts[0]);
        
        // Payoff type
        const qlOptionType = optionType === 'call' ? ql.Option.Type.Call : ql.Option.Type.Put;
        const payoff = new ql.PlainVanillaPayoff(qlOptionType, K);
        
        // Exercise type
        const europeanExercise = new ql.EuropeanExercise(maturityDate);
        
        // Instrument
        const europeanOption = new ql.VanillaOption(payoff, europeanExercise);

        // 6. Pricing Engine
        const engine = new ql.AnalyticEuropeanEngine(process);
        europeanOption.setPricingEngine(engine);

        // 7. Calculate Greeks
        const calculatedDelta = europeanOption.delta();
        const calculatedGamma = europeanOption.gamma();
        
        // QuantLib's theta is often thetaPerDay() or annualized. We use thetaPerDay 
        // for direct daily decay (preferred) and fallback to theta/365.
        // thetaPerDay() returns a value per day, which is what the frontend expects.
        const thetaPerDay = europeanOption.thetaPerDay ? europeanOption.thetaPerDay() : (europeanOption.theta() || 0) / 365;
        const calculatedVega = europeanOption.vega();
        
        // --- END QUANTLIB SETUP ---

        return {
            delta: calculatedDelta,
            gamma: calculatedGamma,
            theta: thetaPerDay,
            vega: calculatedVega,
            impliedVolatility: IV,
        };
    } catch (e) {
        console.error("QuantLib.js calculation failed (Check inputs S, K, T, IV):", e);
        // Fallback to null values if QuantLib throws an error
        return { delta: null, gamma: null, theta: null, vega: null, impliedVolatility: IV };
    }
};