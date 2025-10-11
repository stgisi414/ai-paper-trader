// stgisi414/ai-paper-trader/ai-paper-trader-94da2b93daad8e32642263a52b2c29d9df880b75/services/geminiService.ts

import { GEMINI_BASE_URL } from '../constants';
import * as fmpService from './fmpService';
import type { AiAnalysis, FmpNews, QuestionnaireAnswers, StockPick, FmpIncomeStatement, FmpBalanceSheet, FmpCashFlowStatement, FinancialStatementAnalysis, FmpHistoricalData, TechnicalAnalysis, Portfolio, PortfolioRiskAnalysis, FmpQuote, FmpProfile, KeyMetricsAnalysis, AiScreener, AiWatchlistRecs, CombinedRec, FmpAnalystRating, OptionsStrategyRec, PortfolioRec } from '../types';

const callGeminiProxy = async (prompt: string, model: string, enableTools: boolean, responseSchema?: any): Promise<any> => {
    try {
        console.log(`[GEMINI_SERVICE] Calling Gemini Proxy. Tools enabled: ${enableTools}`);
        const response = await fetch(GEMINI_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model, enableTools, responseSchema }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[GEMINI_SERVICE] Proxy call failed with status ${response.status}:`, errorText);
            throw new Error(`Gemini proxy failed with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        console.log("[GEMINI_SERVICE] Raw response from proxy:", data);
        
        // Planner Mode (JSON generation) check
        if (!enableTools) {
            const cleanedText = data.text
                // CRITICAL FIX: Use a robust regex to strip all variations of Markdown code fences (```, ```json, `) from the start and end.
                // This targets leading and trailing code blocks, cleaning the raw JSON.
                .replace(/^(```json\s*|```\s*|`\s*)+|(```json\s*|```\s*|`\s*)+$/gi, '')
                .trim();
            try {
                return JSON.parse(cleanedText);
            } catch (parseError) {
                 console.error("[GEMINI_SERVICE] Failed to parse AI JSON response. Cleaned text:", cleanedText, parseError);
                 throw new Error("AI response was corrupted and could not be parsed. Check the raw response in the console.");
            }
        }
        
        // Actor Mode (Tool call text response)
        return data;
        
    } catch (error) {
        console.error("[GEMINI_SERVICE] Error in callGeminiProxy:", error);
        throw error;
    }
};

// --- Define all schemas using raw objects ---

const sentimentAnalysisSchema = {
    type: "OBJECT",
    properties: {
        sentiment: { type: "STRING", enum: ["BULLISH", "BEARISH", "NEUTRAL"] },
        confidenceScore: { type: "NUMBER" },
        summary: { type: "STRING" }
    },
    required: ["sentiment", "confidenceScore", "summary"]
};

const stockPickingSchema = {
    type: "OBJECT",
    properties: {
        stocks: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    symbol: { type: "STRING" },
                    reason: { type: "STRING" }
                },
                required: ["symbol", "reason"]
            }
        }
    },
    required: ["stocks"]
};

const financialStatementAnalysisSchema = {
    type: "OBJECT",
    properties: {
        strengths: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    point: { type: "STRING" },
                    description: { type: "STRING" },
                    metrics: { type: "ARRAY", items: { type: "STRING" } },
                },
                required: ["point", "description", "metrics"]
            }
        },
        weaknesses: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    point: { type: "STRING" },
                    description: { type: "STRING" },
                    metrics: { type: "ARRAY", items: { type: "STRING" } },
                },
                required: ["point", "description", "metrics"]
            }
        },
        summary: { type: "STRING" }
    },
    required: ["strengths", "weaknesses", "summary"]
};

const technicalAnalysisSchema = {
    type: "OBJECT",
    properties: {
        trend: { type: "STRING", enum: ['Uptrend', 'Downtrend', 'Sideways'] },
        support: { type: "NUMBER" },
        resistance: { type: "NUMBER" },
        summary: { type: "STRING" }
    },
    required: ["trend", "support", "resistance", "summary"]
};

const portfolioRiskAnalysisSchema = {
    type: "OBJECT",
    properties: {
        riskLevel: { type: "STRING", enum: ['Low', 'Medium', 'High'] },
        concentration: {
            type: "OBJECT",
            properties: {
                highestSector: { type: "STRING" },
                percentage: { type: "NUMBER" }
            },
            required: ["highestSector", "percentage"]
        },
        suggestions: { type: "ARRAY", items: { type: "STRING" } }
    },
    required: ["riskLevel", "concentration", "suggestions"]
};

const combinedRecSchema = {
    type: "OBJECT",
    properties: {
        sentiment: { type: "STRING", enum: ["BULLISH", "BEARISH", "NEUTRAL"] },
        confidence: { type: "STRING", enum: ["High", "Medium", "Low"] },
        strategy: { type: "STRING", enum: ["Buy Stock (Long)", "Short Sell Stock", "Buy Call Options", "Buy Put Options", "Covered Call", "Cash-Secured Put", "No Action"] },
        justification: { type: "STRING" }
    },
    required: ["sentiment", "confidence", "strategy", "justification"]
};

const keyMetricsAnalysisSchema = {
    type: "OBJECT",
    properties: { summary: { type: "STRING" } },
    required: ["summary"]
};

const marketScreenerSchema = {
    type: "OBJECT",
    properties: {
        title: { type: "STRING" },
        description: { type: "STRING" },
        picks: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    symbol: { type: "STRING" },
                    name: { type: "STRING" },
                    reason: { type: "STRING" },
                    score: { type: "NUMBER" }
                },
                required: ["symbol", "name", "reason", "score"]
            }
        }
    },
    required: ["title", "description", "picks"]
};

const watchlistRecsSchema = {
    type: "OBJECT",
    properties: {
        picks: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    symbol: { type: "STRING" },
                    name: { type: "STRING" },
                    reason: { type: "STRING" },
                },
                required: ["symbol", "name", "reason"]
            }
        }
    },
    required: ["picks"]
};

const optionsStrategySchema = {
    type: "OBJECT",
    properties: {
        strategyName: { type: "STRING", description: "The common name of the options strategy (e.g., 'Covered Call', 'Bull Put Spread')." },
        description: { type: "STRING", description: "A detailed explanation of the strategy, its purpose, and market outlook." },
        marketOutlook: { type: "STRING", enum: ["Bullish", "Bearish", "Neutral", "Moderately Bullish", "Moderately Bearish", "High Volatility", "Low Volatility"] },
        timeframe: { type: "STRING", description: "The ideal timeframe for this strategy (e.g., '30-45 Days')." },
        riskProfile: { type: "STRING", enum: ["Defined Risk", "Undefined Risk"] },
        profitProfile: { type: "STRING", enum: ["Defined Profit", "Undefined Profit"] },
        keyMetrics: {
            type: "OBJECT",
            properties: {
                underlyingSymbol: { type: "STRING" },
                underlyingPrice: { type: "NUMBER" },
                maxProfit: { type: "NUMBER", description: "Maximum potential profit per 100 shares." },
                maxLoss: { type: "NUMBER", description: "Maximum potential loss per 100 shares." },
                breakevenPrice: { type: "NUMBER" },
                netCredit: { type: "NUMBER", description: "Net credit received for entering the position (for credit spreads)." },
            },
            required: ["underlyingSymbol", "underlyingPrice", "maxProfit", "maxLoss", "breakevenPrice"]
        },
        suggestedContracts: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    type: { type: "STRING", enum: ['Call', 'Put'] },
                    action: { type: "STRING", enum: ['Buy', 'Sell'] },
                    strikePrice: { type: "NUMBER" },
                    expirationDate: { type: "STRING", description: "YYYY-MM-DD" },
                    premium: { type: "NUMBER", description: "Estimated premium per share." },
                    rationale: { type: "STRING", description: "A brief justification for choosing this specific contract." }
                },
                required: ["type", "action", "strikePrice", "expirationDate", "premium", "rationale"]
            }
        },
        commentary: { type: "STRING", description: "Overall commentary on the suitability of this strategy for the given stock and market conditions." }
    },
    required: ["strategyName", "description", "marketOutlook", "keyMetrics", "suggestedContracts", "commentary"]
};

const portfolioRecSchema = {
    type: "OBJECT",
    properties: {
        recommendationType: { type: "STRING", enum: ['Buy Stock', 'Sell Stock', 'Hold', 'Rebalance', 'New Idea'], description: "The type of action recommended." },
        targetTicker: { type: "STRING", description: "The ticker symbol the recommendation applies to (or the recommended new ticker)." },
        actionJustification: { type: "STRING", description: "The detailed rationale for the recommendation, focusing on portfolio context and query intent." },
        suggestedQuantity: { type: "NUMBER", description: "A suggested quantity of shares (e.g., 50 or 100). Null if not a Buy/Sell recommendation." },
        currentExposurePercent: { type: "NUMBER", description: "The estimated percentage exposure of the target ticker's sector in the current portfolio. Null if not calculable." },
    },
    required: ["recommendationType", "targetTicker", "actionJustification"]
};

// --- Exported Functions ---

// Helper function to call proxy with schema for Planner Mode
export const callGeminiProxyWithSchema = async (prompt: string, model: string, schema: any): Promise<any> => { // MODIFICATION: ADD 'export'
    // The model is told to output JSON, so enableTools is explicitly false
    return callGeminiProxy(prompt, model, false, schema); 
};

export const analyzeNewsSentiment = async (companyName: string, news: FmpNews[]): Promise<AiAnalysis> => {
    const prompt = `
        Analyze the sentiment for ${companyName} based on these headlines: ${news.map(n => n.title).join('\n')}.
        CRITICAL TASK: Output ONLY the three top-level fields: "sentiment", "confidenceScore", and "summary".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxyWithSchema(prompt, "gemini-2.5-flash", sentimentAnalysisSchema);
};

export const getStockPicks = async (answers: QuestionnaireAnswers): Promise<{stocks: StockPick[]}> => {
    const prompt = `
        Recommend stocks based on these preferences: ${JSON.stringify(answers)}.
        CRITICAL TASK: Output ONLY the single top-level field: "stocks" (containing the array).
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxyWithSchema(prompt, "gemini-2.5-flash", stockPickingSchema);
};

export const analyzeFinancialStatements = async (incomeStatement: FmpIncomeStatement, balanceSheet: FmpBalanceSheet, cashFlow: FmpCashFlowStatement): Promise<FinancialStatementAnalysis> => {
    const prompt = `
        Analyze these financial statements: Income=${JSON.stringify(incomeStatement)}, BalanceSheet=${JSON.stringify(balanceSheet)}, CashFlow=${JSON.stringify(cashFlow)}.
        CRITICAL TASK: Output ONLY the three top-level fields: "strengths", "weaknesses", and "summary".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxyWithSchema(prompt, "gemini-2.5-pro", financialStatementAnalysisSchema);
};

export const getTechnicalAnalysis = async (historicalData: FmpHistoricalData[]): Promise<TechnicalAnalysis> => {
    const prompt = `
        Provide a technical analysis on this historical data: ${JSON.stringify(historicalData.slice(-90))}.
        CRITICAL TASK: Output ONLY the four top-level fields: "trend", "support", "resistance", and "summary".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxyWithSchema(prompt, "gemini-2.5-flash", technicalAnalysisSchema);
};

export const analyzePortfolioRisk = async (portfolio: Portfolio): Promise<PortfolioRiskAnalysis> => {
    const allTickers = new Set<string>();
    portfolio.holdings.forEach(h => allTickers.add(h.ticker));
    portfolio.optionHoldings.forEach(o => allTickers.add(o.underlyingTicker));
    
    const tickerArray = Array.from(allTickers);
    let sectorsInfo = {};

    if (tickerArray.length > 0) {
        try {
            // Fetch profiles for all relevant tickers
            const profiles = await fmpService.getProfile(tickerArray.join(','));
            profiles.forEach(p => {
                if (p.symbol && p.sector) {
                    // Map ticker to its sector
                    sectorsInfo[p.symbol] = p.sector;
                }
            });
        } catch (e) {
            console.error("Failed to fetch sector data for risk analysis:", e);
        }
    }

    const prompt = `
        You are an expert financial risk analyst.
        Analyze the portfolio data provided below. 
        
        CRITICAL TASK: Generate a JSON object that STRICTLY conforms to the following requirements:
        1. The entire JSON must ONLY contain the three top-level keys: "riskLevel", "concentration", and "suggestions".
        2. The "concentration" field MUST be a nested JSON object.
        3. Calculate the highest sector exposure based on the 'Stock Sectors' provided and fill the "concentration" object. 
           (e.g., {"highestSector": "Healthcare", "percentage": 100}).

        Portfolio data: ${JSON.stringify(portfolio)}
        Stock Sectors: ${JSON.stringify(sectorsInfo)} 
        
        YOU MUST RESPOND ONLY with a valid JSON object that conforms exactly to the provided schema.
    `;

    return callGeminiProxyWithSchema(prompt, "gemini-2.5-pro", portfolioRiskAnalysisSchema);
};

export const getCombinedRecommendations = async (profile: FmpProfile, ratings: FmpAnalystRating[], technicals: TechnicalAnalysis): Promise<CombinedRec> => {
    const prompt = `
        Generate a trading recommendation for ${profile.companyName} using this data: Profile=${JSON.stringify(profile)}, Ratings=${JSON.stringify(ratings[0])}, Technicals=${JSON.stringify(technicals)}.
        CRITICAL TASK: Output ONLY the four top-level fields: "sentiment", "confidence", "strategy", and "justification".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxyWithSchema(prompt, "gemini-2.5-pro", combinedRecSchema);
};

export const analyzeKeyMetrics = async (quote: FmpQuote, profile: FmpProfile): Promise<KeyMetricsAnalysis> => {
    const prompt = `
        Provide a friendly, multi-faceted summary for ${profile.companyName} based on these key metrics: ${JSON.stringify(quote)}.
        CRITICAL TASK: Output ONLY the single top-level field: "summary".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxyWithSchema(prompt, "gemini-2.5-flash", keyMetricsAnalysisSchema);
};

export const getMarketScreenerPicks = async (userPrompt: string): Promise<AiScreener> => {
    const prompt = `
        Find 5 stocks that match this request: "${userPrompt}". 
        CRITICAL: The objects in the "picks" array MUST use the exact property names: "symbol" (the ticker), "name" (the company name), "reason" (the rationale), and "score" (a number from 1 to 10). 
        DO NOT use "ticker", "company_name", or "rationale" in the final JSON.
        CRITICAL TASK: Output ONLY the three top-level fields: "title", "description", and "picks".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxyWithSchema(prompt, "gemini-2.5-pro", marketScreenerSchema);
};

export const getWatchlistPicks = async (holdings: { ticker: string, shares: number }[], watchlist: string[], news: string): Promise<AiWatchlistRecs> => {
    const prompt = `
        Recommend 3 new stocks for a watchlist. Current assets: ${[...holdings.map(h=>h.ticker), ...watchlist].join(', ')}. News summary: ${news}.
        CRITICAL: The objects in the "picks" array MUST use the exact property names: "symbol" (the ticker), "name" (the company name), and "reason" (the rationale). 
        DO NOT use "ticker", "company_name", or "rationale" in the final JSON.
        CRITICAL TASK: Output ONLY the single top-level field: "picks" (containing the array).
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxyWithSchema(prompt, "gemini-2.5-pro", watchlistRecsSchema);
};

// --- Test Function with Forceful Prompt ---
export const runToolCallingTest = async (testName: string, prompt: string): Promise<{ text: string }> => {
    console.log(`[GEMINI_SERVICE] Starting tool calling test: "${testName}"`);
    try {
        // Run with tools enabled (Actor Mode)
        const result = await callGeminiProxy(prompt, "gemini-2.5-flash", true); 
        console.log(`[GEMINI_SERVICE] Test "${testName}" successful. Raw result:`, result);
        return { text: `Success: ${result.text}` };
    } catch (error) {
        console.error(`[GEMINI_SERVICE] Test "${testName}" failed:`, error);
        return { text: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
};

export const getOptionsStrategy = async (userPrompt: string, stockTicker: string): Promise<OptionsStrategyRec> => {
    const prompt = `
        As an expert options strategist, analyze the current market data for ${stockTicker} and devise a concrete options strategy based on the user's request: "${userPrompt}". 
        
        Use the 'get_fmp_quote' and 'get_options_chain' tools to retrieve necessary data. When retrieving options data, fetch contracts expiring closest to 30-60 days out. 
        
        CRITICAL TASK: Output ONLY a raw JSON object that strictly conforms to the provided schema. The 'suggestedContracts' array MUST contain the specific legs of the proposed strategy.
    `;
    // We use gemini-2.5-pro for its better reasoning and tool-use
    return callGeminiProxy(prompt, "gemini-2.5-pro", true, optionsStrategySchema); 
};

export const getPortfolioRecommendation = async (userPrompt: string, portfolio: Portfolio, currentTicker?: string): Promise<PortfolioRec> => {
    
    let currentTickerProfile: FmpProfile | null = null;
    if (currentTicker) {
        try {
            // Fetch profile for context (sector, industry)
            const profiles = await fmpService.getProfile(currentTicker);
            currentTickerProfile = profiles[0] || null;
        } catch (e) {
            console.error(`Failed to fetch profile for ${currentTicker}:`, e);
        }
    }
    
    const prompt = `
        You are an expert portfolio manager. Your task is to provide a single, actionable investment recommendation based on the user's explicit request and their current portfolio risk context.

        **User Request:** "${userPrompt}"
        
        **Current Portfolio Summary:** ${JSON.stringify({
            cash: portfolio.cash,
            // Keep holdings simple to reduce prompt size
            holdings: portfolio.holdings.map(h => ({ ticker: h.ticker, shares: h.shares, value: h.shares * h.currentPrice })),
            optionHoldings: portfolio.optionHoldings.map(o => ({ symbol: o.symbol, underlying: o.underlyingTicker })),
        })}
        
        ${currentTickerProfile ? `**Current Stock Context (${currentTicker}):** ${JSON.stringify({ sector: currentTickerProfile.sector, industry: currentTickerProfile.industry, description: currentTickerProfile.description.substring(0, 100) + '...' })}` : ''}

        CRITICAL TASK: Output ONLY a raw JSON object that strictly conforms to the provided schema. Analyze the portfolio for over/under-exposure and suggest a definitive action (Buy, Sell, Hold, Rebalance, or New Idea).
    `;
    // Use gemini-2.5-pro for complex reasoning. Set enableTools to false as the data is provided in the prompt.
    return callGeminiProxy(prompt, "gemini-2.5-pro", false, portfolioRecSchema); 
};