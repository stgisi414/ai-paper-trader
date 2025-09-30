import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GEMINI_API_KEY } from '../constants';
import type { AiAnalysis, FmpNews, QuestionnaireAnswers, StockPick, FmpIncomeStatement, FmpBalanceSheet, FmpCashFlowStatement, FinancialStatementAnalysis, FmpHistoricalData, TechnicalAnalysis, Portfolio, PortfolioRiskAnalysis } from '../types';

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