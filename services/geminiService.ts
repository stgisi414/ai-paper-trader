import { GEMINI_BASE_URL } from '../constants';
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
        return JSON.parse(data.text);
    } catch (error) {
        console.error("Error calling Gemini proxy:", error);
        throw new Error("Failed to get AI analysis from proxy.");
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
    const prompt = `Based on the news for ${companyName}, provide a market sentiment analysis. Headlines: ${news.map(n => n.title).join('\n')}`;
    return callGeminiProxy(prompt, "gemini-2.5-flash", sentimentAnalysisSchema);
};

export const getStockPicks = async (answers: QuestionnaireAnswers): Promise<{stocks: StockPick[]}> => {
    const prompt = `Recommend stocks based on these preferences: ${JSON.stringify(answers)}`;
    return callGeminiProxy(prompt, "gemini-2.5-flash", stockPickingSchema);
};

export const analyzeFinancialStatements = async (incomeStatement: FmpIncomeStatement, balanceSheet: FmpBalanceSheet, cashFlow: FmpCashFlowStatement): Promise<FinancialStatementAnalysis> => {
    const prompt = `Analyze these financial statements: Income=${JSON.stringify(incomeStatement)}, BalanceSheet=${JSON.stringify(balanceSheet)}, CashFlow=${JSON.stringify(cashFlow)}`;
    return callGeminiProxy(prompt, "gemini-2.5-pro", financialStatementAnalysisSchema);
};

export const getTechnicalAnalysis = async (historicalData: FmpHistoricalData[]): Promise<TechnicalAnalysis> => {
    const prompt = `Provide a technical analysis on this historical data: ${JSON.stringify(historicalData.slice(-90))}`; // Send last 90 days
    return callGeminiProxy(prompt, "gemini-2.5-flash", technicalAnalysisSchema);
};

export const analyzePortfolioRisk = async (portfolio: Portfolio): Promise<PortfolioRiskAnalysis> => {
    const prompt = `Provide a risk analysis for this portfolio: ${JSON.stringify(portfolio)}`;
    return callGeminiProxy(prompt, "gemini-2.5-pro", portfolioRiskAnalysisSchema);
};

export const getCombinedRecommendations = async (profile: FmpProfile, ratings: FmpAnalystRating[], technicals: TechnicalAnalysis): Promise<CombinedRec> => {
    const prompt = `Generate a trading recommendation for ${profile.companyName} using this data: Profile=${JSON.stringify(profile)}, Ratings=${JSON.stringify(ratings[0])}, Technicals=${JSON.stringify(technicals)}`;
    return callGeminiProxy(prompt, "gemini-2.5-pro", combinedRecSchema);
};

export const analyzeKeyMetrics = async (quote: FmpQuote, profile: FmpProfile): Promise<KeyMetricsAnalysis> => {
    const prompt = `Provide a friendly, multi-faceted summary for ${profile.companyName} based on these key metrics: ${JSON.stringify(quote)}`;
    return callGeminiProxy(prompt, "gemini-2.5-flash", keyMetricsAnalysisSchema);
};

export const getMarketScreenerPicks = async (userPrompt: string): Promise<AiScreener> => {
    const tickerUniverse = "AAPL, MSFT, GOOGL, AMZN, NVDA, META, TSLA, BRK.B, V, JPM, JNJ, WMT, UNH, PG, MA, HD, XOM, CVX, LLY, MRK";
    const prompt = `From the universe of ${tickerUniverse}, find 5 stocks that match this request: "${userPrompt}"`;
    return callGeminiProxy(prompt, "gemini-2.5-pro", marketScreenerSchema);
};

export const getWatchlistPicks = async (holdings: { ticker: string, shares: number }[], watchlist: string[], news: string): Promise<AiWatchlistRecs> => {
    const prompt = `Recommend 3 new stocks for a watchlist. Current assets: ${[...holdings.map(h=>h.ticker), ...watchlist].join(', ')}. News summary: ${news}`;
    return callGeminiProxy(prompt, "gemini-2.5-pro", watchlistRecsSchema);
};