
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GEMINI_API_KEY } from '../constants';
import type { AiAnalysis, FmpNews } from '../types';

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
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: sentimentAnalysisSchema,
            },
        });
        
        const jsonText = response.text.trim();
        const result = JSON.parse(jsonText) as AiAnalysis;
        return result;

    } catch (error) {
        console.error("Error analyzing news sentiment with Gemini:", error);
        throw new Error("Failed to get AI analysis.");
    }
};
