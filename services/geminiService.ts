import { GEMINI_BASE_URL } from '../constants';
import * as fmpService from './fmpService';
import type { AiAnalysis, FmpNews, QuestionnaireAnswers, StockPick, FmpIncomeStatement, FmpBalanceSheet, FmpCashFlowStatement, FinancialStatementAnalysis, FmpHistoricalData, TechnicalAnalysis, Portfolio, PortfolioRiskAnalysis, FmpQuote, FmpProfile, KeyMetricsAnalysis, AiScreener, AiWatchlistRecs, CombinedRec, FmpAnalystRating } from '../types';

const callGeminiProxy = async (prompt: string, model: string, schema: object): Promise<any> => {
    try {
        const response = await fetch(GEMINI_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, model, schema }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini proxy failed with status ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        
        // Aggressive client-side cleaning (remains for consistency)
        const cleanedText = data.text
            .replace(/^```json\s*|\s*```$/g, '')
            .trim(); 

        // CRITICAL FIX: Wrap JSON.parse in a try/catch to prevent component crash.
        try {
            return JSON.parse(cleanedText);
        } catch (parseError) {
             console.error("Failed to parse AI response as JSON:", cleanedText, parseError);
             // Throw a caught error instead of an uncaught synchronous exception
             throw new Error("AI response was corrupted and could not be parsed. Please try again.");
        }
        
    } catch (error) {
        console.error("Error calling Gemini proxy:", error);
        throw error;
    }
};

// --- Define all schemas using raw strings ---

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
        strengths: { type: "ARRAY", items: { type: "STRING" } },
        weaknesses: { type: "ARRAY", items: { type: "STRING" } },
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


// --- Exported Functions ---

export const analyzeNewsSentiment = async (companyName: string, news: FmpNews[]): Promise<AiAnalysis> => {
    const prompt = `
        Analyze the sentiment for ${companyName} based on these headlines: ${news.map(n => n.title).join('\n')}.
        CRITICAL TASK: Output ONLY the three top-level fields: "sentiment", "confidenceScore", and "summary".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxy(prompt, "gemini-2.5-flash", sentimentAnalysisSchema);
};

export const getStockPicks = async (answers: QuestionnaireAnswers): Promise<{stocks: StockPick[]}> => {
    const prompt = `
        Recommend stocks based on these preferences: ${JSON.stringify(answers)}.
        CRITICAL TASK: Output ONLY the single top-level field: "stocks" (containing the array).
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxy(prompt, "gemini-2.5-flash", stockPickingSchema);
};

export const analyzeFinancialStatements = async (incomeStatement: FmpIncomeStatement, balanceSheet: FmpBalanceSheet, cashFlow: FmpCashFlowStatement): Promise<FinancialStatementAnalysis> => {
    const prompt = `
        Analyze these financial statements: Income=${JSON.stringify(incomeStatement)}, BalanceSheet=${JSON.stringify(balanceSheet)}, CashFlow=${JSON.stringify(cashFlow)}.
        CRITICAL TASK: Output ONLY the three top-level fields: "strengths", "weaknesses", and "summary".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxy(prompt, "gemini-2.5-pro", financialStatementAnalysisSchema);
};

export const getTechnicalAnalysis = async (historicalData: FmpHistoricalData[]): Promise<TechnicalAnalysis> => {
    const prompt = `
        Provide a technical analysis on this historical data: ${JSON.stringify(historicalData.slice(-90))}.
        CRITICAL TASK: Output ONLY the four top-level fields: "trend", "support", "resistance", and "summary".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxy(prompt, "gemini-2.5-flash", technicalAnalysisSchema);
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

    return callGeminiProxy(prompt, "gemini-2.5-pro", portfolioRiskAnalysisSchema);
};

export const getCombinedRecommendations = async (profile: FmpProfile, ratings: FmpAnalystRating[], technicals: TechnicalAnalysis): Promise<CombinedRec> => {
    const prompt = `
        Generate a trading recommendation for ${profile.companyName} using this data: Profile=${JSON.stringify(profile)}, Ratings=${JSON.stringify(ratings[0])}, Technicals=${JSON.stringify(technicals)}.
        CRITICAL TASK: Output ONLY the four top-level fields: "sentiment", "confidence", "strategy", and "justification".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxy(prompt, "gemini-2.5-pro", combinedRecSchema);
};

export const analyzeKeyMetrics = async (quote: FmpQuote, profile: FmpProfile): Promise<KeyMetricsAnalysis> => {
    const prompt = `
        Provide a friendly, multi-faceted summary for ${profile.companyName} based on these key metrics: ${JSON.stringify(quote)}.
        CRITICAL TASK: Output ONLY the single top-level field: "summary".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxy(prompt, "gemini-2.5-flash", keyMetricsAnalysisSchema);
};

export const getMarketScreenerPicks = async (userPrompt: string): Promise<AiScreener> => {
    // REMOVED: const tickerUniverse = "AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, BRK.B, V, JPM, JNJ, WMT, UNH, PG, MA, HD, XOM, CVX, LLY, MRK";
    const prompt = `
        Find 5 stocks that match this request: "${userPrompt}". 
        CRITICAL: The objects in the "picks" array MUST use the exact property names: "symbol" (the ticker), "name" (the company name), "reason" (the rationale), and "score" (a number from 1 to 10). 
        DO NOT use "ticker", "company_name", or "rationale" in the final JSON.
        CRITICAL TASK: Output ONLY the three top-level fields: "title", "description", and "picks".
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxy(prompt, "gemini-2.5-pro", marketScreenerSchema);
};

export const getWatchlistPicks = async (holdings: { ticker: string, shares: number }[], watchlist: string[], news: string): Promise<AiWatchlistRecs> => {
    const prompt = `
        Recommend 3 new stocks for a watchlist. Current assets: ${[...holdings.map(h=>h.ticker), ...watchlist].join(', ')}. News summary: ${news}.
        CRITICAL: The objects in the "picks" array MUST use the exact property names: "symbol" (the ticker), "name" (the company name), and "reason" (the rationale). 
        DO NOT use "ticker", "company_name", or "rationale" in the final JSON.
        CRITICAL TASK: Output ONLY the single top-level field: "picks" (containing the array).
        YOU MUST RESPOND ONLY with a valid JSON object that conforms strictly to the provided schema.
    `;
    return callGeminiProxy(prompt, "gemini-2.5-pro", watchlistRecsSchema);
};

// --- Test Function with Forceful Prompt ---
export const testGeminiProxy = async (): Promise<{ status: string; message: string }> => {
    const prompt = `
        Define what a stock is in a single, simple sentence. 
        YOU MUST RESPOND ONLY with a valid JSON object that conforms to the provided schema.
        For the 'status' field, use 'success'. For the 'message' field, use your single-sentence explanation.
    `;
    const schema = {
        type: "OBJECT",
        properties: {
            status: { type: "STRING" },
            message: { type: "STRING" }
        },
        required: ["status", "message"]
    };
    return callGeminiProxy(prompt, "gemini-2.5-flash", schema);
};