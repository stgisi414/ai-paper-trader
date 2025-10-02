import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GEMINI_API_KEY } from '../constants';
import type { AiAnalysis, FmpNews, QuestionnaireAnswers, StockPick, FmpIncomeStatement, FmpBalanceSheet, FmpCashFlowStatement, FinancialStatementAnalysis, FmpHistoricalData, TechnicalAnalysis, Portfolio, PortfolioRiskAnalysis, FmpQuote, FmpProfile, KeyMetricsAnalysis, AiScreener } from '../types'; // ADD AiScreener

if (!GEMINI_API_KEY) {
    console.error("Gemini API key is not configured.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' });

const sentimentAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        sentiment: {
            type: Type.STRING,
            enum: ["BULLISH", "BEARISH", "NEUTRAL"],
            description: "Market sentiment for the stock based on the news."
        },
        confidenceScore: {
            type: Type.NUMBER,
            description: "Confidence in the sentiment analysis, from 0.0 to 1.0."
        },
        summary: {
            type: Type.STRING,
            description: "A 2-3 sentence summary explaining the reasoning for the sentiment."
        }
    },
    required: ["sentiment", "confidenceScore", "summary"]
};

export const analyzeNewsSentiment = async (companyName: string, news: FmpNews[]): Promise<AiAnalysis> => {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not set.");
    }

    const newsHeadlines = news.map(n => n.title).join('\n');
    const prompt = `
        Based on the following news headlines for ${companyName}, provide a market sentiment analysis.
        The output must be a JSON object matching the provided schema.
        
        News headlines:
        ${newsHeadlines}
    `;

    try {
        let response: GenerateContentResponse | null = null;
        for (let i = 0; i < 3; i++) {
            try {
                response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: sentimentAnalysisSchema,
                    },
                });
                break;
            } catch (error) {
                if (i < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    throw error;
                }
            }
        }
        if (!response) throw new Error("AI response was null");
        
        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText) as AiAnalysis;
        return result;

    } catch (error) {
        console.error("Error analyzing news sentiment with Gemini:", error);
        throw new Error("Failed to get AI analysis.");
    }
};

const stockPickingSchema = {
    type: Type.OBJECT,
    properties: {
        stocks: {
            type: Type.ARRAY,
            description: "A list of recommended stock tickers.",
            items: {
                type: Type.OBJECT,
                properties: {
                    symbol: {
                        type: Type.STRING,
                        description: "The stock ticker symbol."
                    },
                    reason: {
                        type: Type.STRING,
                        description: "A 1-2 sentence explanation of why this stock is a good pick."
                    }
                },
                required: ["symbol", "reason"]
            }
        }
    },
    required: ["stocks"]
};

export const getStockPicks = async (answers: QuestionnaireAnswers): Promise<{stocks: StockPick[]}> => {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not set.");
    }

    const { risk, strategy, sectors, stockCount } = answers;
    const stockCountMap = {
        few: '3 to 5',
        several: '5 to 8',
        many: '8 to 12'
    };
    const numberOfStocks = stockCountMap[stockCount];

    const prompt = `
        Based on the following investment preferences, recommend ${numberOfStocks} stocks.
        The output must be a JSON object matching the provided schema.

        - Risk Tolerance: ${risk}
        - Investment Strategy: ${strategy}
        - Preferred Sectors: ${sectors.join(', ')}

        Please provide a diverse list of stocks that align with these preferences.
        For each stock, include the ticker symbol and a brief reason for the recommendation.
    `;

    try {
        let response: GenerateContentResponse | null = null;
        for (let i = 0; i < 3; i++) {
            try {
                response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: stockPickingSchema,
                    },
                });
                break;
            } catch (error) {
                if (i < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    throw error;
                }
            }
        }

        if (!response) throw new Error("AI response was null");

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as {stocks: StockPick[]};

    } catch (error) {
        console.error("Error getting stock picks from Gemini:", error);
        throw new Error("Failed to get AI stock picks.");
    }
};

const financialStatementAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        strengths: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of financial strengths."
        },
        weaknesses: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of financial weaknesses."
        },
        summary: {
            type: Type.STRING,
            description: "A 2-3 sentence summary of the financial health of the company."
        }
    },
    required: ["strengths", "weaknesses", "summary"]
};

export const analyzeFinancialStatements = async (incomeStatement: FmpIncomeStatement, balanceSheet: FmpBalanceSheet, cashFlow: FmpCashFlowStatement): Promise<FinancialStatementAnalysis> => {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not set.");
    }

    const prompt = `
        Analyze the following financial statements and provide a summary of the company's financial health.
        The output must be a JSON object matching the provided schema.

        Income Statement:
        ${JSON.stringify(incomeStatement)}

        Balance Sheet:
        ${JSON.stringify(balanceSheet)}

        Cash Flow Statement:
        ${JSON.stringify(cashFlow)}
    `;

    try {
        let response: GenerateContentResponse | null = null;
        for (let i = 0; i < 3; i++) {
            try {
                response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: financialStatementAnalysisSchema,
                    },
                });
                break;
            } catch (error) {
                if (i < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    throw error;
                }
            }
        }

        if (!response) throw new Error("AI response was null");

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as FinancialStatementAnalysis;

    } catch (error) {
        console.error("Error analyzing financial statements with Gemini:", error);
        throw new Error("Failed to get AI financial analysis.");
    }
}

const technicalAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        trend: {
            type: Type.STRING,
            enum: ['Uptrend', 'Downtrend', 'Sideways'],
            description: "The current trend of the stock."
        },
        support: {
            type: Type.NUMBER,
            description: "The support level for the stock."
        },
        resistance: {
            type: Type.NUMBER,
            description: "The resistance level for the stock."
        },
        summary: {
            type: Type.STRING,
            description: "A 2-3 sentence summary of the technical analysis."
        }
    },
    required: ["trend", "support", "resistance", "summary"]
};

export const getTechnicalAnalysis = async (historicalData: FmpHistoricalData[]): Promise<TechnicalAnalysis> => {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not set.");
    }

    const prompt = `
        Analyze the following historical price data and provide a technical analysis.
        The output must be a JSON object matching the provided schema.

        Historical Data:
        ${JSON.stringify(historicalData)}
    `;

    try {
        let response: GenerateContentResponse | null = null;
        for (let i = 0; i < 3; i++) {
            try {
                response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: technicalAnalysisSchema,
                    },
                });
                break;
            } catch (error) {
                if (i < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    throw error;
                }
            }
        }

        if (!response) throw new Error("AI response was null");

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as TechnicalAnalysis;

    } catch (error) {
        console.error("Error getting technical analysis from Gemini:", error);
        throw new Error("Failed to get AI technical analysis.");
    }
}

const portfolioRiskAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        riskLevel: {
            type: Type.STRING,
            enum: ['Low', 'Medium', 'High'],
            description: "The overall risk level of the portfolio."
        },
        concentration: {
            type: Type.OBJECT,
            properties: {
                highestSector: {
                    type: Type.STRING,
                    description: "The sector with the highest concentration."
                },
                percentage: {
                    type: Type.NUMBER,
                    description: "The percentage of the portfolio in the highest sector."
                }
            },
            required: ["highestSector", "percentage"]
        },
        suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of suggestions to improve the portfolio's risk profile."
        }
    },
    required: ["riskLevel", "concentration", "suggestions"]
};

export const analyzePortfolioRisk = async (portfolio: Portfolio): Promise<PortfolioRiskAnalysis> => {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not set.");
    }

    const prompt = `
        Analyze the following portfolio and provide a risk analysis.
        The output must be a JSON object matching the provided schema.

        Portfolio:
        ${JSON.stringify(portfolio)}
    `;

    try {
        let response: GenerateContentResponse | null = null;
        for (let i = 0; i < 3; i++) {
            try {
                response = await ai.models.generateContent({
                    model: "gemini-2.5-flash",
                    contents: prompt,
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: portfolioRiskAnalysisSchema,
                    },
                });
                break;
            } catch (error) {
                if (i < 2) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                    throw error;
                }
            }
        }

        if (!response) throw new Error("AI response was null");

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as PortfolioRiskAnalysis;

    } catch (error) {
        console.error("Error analyzing portfolio risk with Gemini:", error);
        throw new Error("Failed to get AI portfolio risk analysis.");
    }
}

const combinedRecSchema = {
    type: Type.OBJECT,
    properties: {
        sentiment: {
            type: Type.STRING,
            enum: ["BULLISH", "BEARISH", "NEUTRAL"],
            description: "The overall synthesized sentiment for the stock based on all provided data."
        },
        confidence: {
            type: Type.STRING,
            enum: ["High", "Medium", "Low"],
            description: "The AI's confidence level in its sentiment assessment."
        },
        strategy: {
            type: Type.STRING,
            description: "A 2-3 sentence summary of a potential trading strategy (e.g., buying calls, writing covered calls, buying puts) based on the analysis. This should be a general strategy, not a specific contract."
        },
        justification: {
            type: Type.STRING,
            description: "A detailed 3-4 sentence explanation of why this strategy is recommended, referencing the technical, fundamental, and analyst data provided."
        }
    },
    required: ["sentiment", "confidence", "strategy", "justification"]
};

export const getCombinedRecommendations = async (
    profile: FmpProfile,
    ratings: FmpAnalystRating[],
    technicals: TechnicalAnalysis
): Promise<any> => { // Using 'any' for now as we'll define the new type next
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not set.");
    }

    const prompt = `
        Analyze the following data for ${profile.companyName} (${profile.symbol}) to generate an advanced trading recommendation.
        1.  **Fundamental Data**: ${profile.description}
        2.  **Analyst Ratings Summary**: ${JSON.stringify(ratings)}
        3.  **AI Technical Analysis**: Trend is ${technicals.trend}, Support is at ${technicals.support}, Resistance is at ${technicals.resistance}. Summary: ${technicals.summary}

        Based on a synthesis of all three data points, provide an overall sentiment, a confidence level, a potential options strategy, and a detailed justification.
        The output must be a JSON object matching the provided schema.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: combinedRecSchema,
            },
        });

        if (!response) throw new Error("AI response was null");

        const jsonText = response.text.trim();
        return JSON.parse(jsonText);

    } catch (error) {
        console.error("Error getting combined recommendations from Gemini:", error);
        throw new Error("Failed to get AI combined recommendations.");
    }
};

const keyMetricsAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        summary: {
            type: Type.STRING,
            description: "A multi-faceted friendly summary of the company based on its key metrics from an economical, financial, and laissez-faire perspective."
        }
    },
    required: ["summary"]
};

export const analyzeKeyMetrics = async (quote: FmpQuote, profile: FmpProfile): Promise<KeyMetricsAnalysis> => {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not set.");
    }

    const prompt = `
        Provide a multi-faceted analysis for ${profile.companyName} (${profile.symbol}) based on the following key metrics. The summary should be friendly and easy to understand for a retail investor.

        Key Metrics:
        - Price: ${quote.price}
        - Market Cap: ${quote.marketCap}
        - 52-Week Range: ${quote.yearLow} - ${quote.yearHigh}
        - P/E Ratio: ${quote.pe}
        - EPS: ${quote.eps}
        - Volume: ${quote.volume}
        - Sector: ${profile.sector}
        - Industry: ${profile.industry}

        Please structure the analysis into three perspectives:
        1.  **Economical**: How does this company fit into the broader economic landscape of its sector and the market as a whole?
        2.  **Financial**: Based on these metrics, what is a snapshot of its financial health and valuation?
        3.  **Laissez-Faire**: From a hands-off, free-market perspective, what is the company's potential for innovation and growth without heavy intervention?

        Combine these points into a single, flowing summary paragraph. The output must be a JSON object matching the provided schema.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: keyMetricsAnalysisSchema,
            },
        });

        if (!response) throw new Error("AI response was null");

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as KeyMetricsAnalysis;

    } catch (error) {
        console.error("Error analyzing key metrics with Gemini:", error);
        throw new Error("Failed to get AI key metrics analysis.");
    }
};

const marketScreenerSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "A catchy title for this list of stocks." },
        description: { type: Type.STRING, description: "A one-sentence summary of the criteria used for this screen." },
        picks: {
            type: Type.ARRAY,
            description: "A list of 5 stock picks matching the criteria.",
            items: {
                type: Type.OBJECT,
                properties: {
                    symbol: { type: Type.STRING, description: "The stock ticker symbol." },
                    name: { type: Type.STRING, description: "The company name." },
                    reason: { type: Type.STRING, description: "A 1-2 sentence explanation of why this stock was selected by the AI for this specific screen." },
                    score: { type: Type.NUMBER, description: "A score from 80 to 100 representing how strongly this stock fits the criteria." }
                },
                required: ["symbol", "name", "reason", "score"]
            }
        }
    },
    required: ["title", "description", "picks"]
};

// Add this new function (e.g., around line 344)
export const getMarketScreenerPicks = async (prompt: string): Promise<AiScreener> => {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not set.");
    }

    // A list of the largest tickers the AI should analyze
    const tickerUniverse = [
        "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "BRK.B", "V", 
        "JPM", "JNJ", "WMT", "UNH", "PG", "MA", "HD", "XOM", "CVX", "LLY", "MRK"
    ].join(', ');
    
    const fullPrompt = `
        Analyze the stock market universe: ${tickerUniverse}.
        Based on your deep market knowledge, fulfill the following screen request.
        The output must be a JSON object matching the provided schema.

        Screen Request: "${prompt}"

        Instructions:
        1. Select 5 stocks from the universe that best match the request.
        2. Provide the company name for each stock.
        3. Assign a score (80-100) based on fit.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro", // Using Pro for deep market analysis/screening
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: marketScreenerSchema,
            },
        });

        if (!response) throw new Error("AI response was null");

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as AiScreener;

    } catch (error) {
        console.error("Error getting market screener picks from Gemini:", error);
        throw new Error("Failed to get AI market screener picks.");
    }
};