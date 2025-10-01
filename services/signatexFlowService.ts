import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GEMINI_API_KEY } from '../constants';

if (!GEMINI_API_KEY) {
    console.error("Gemini API key is not configured for Signatex Flow.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' });

// Defines the structure of a single step in the workflow
export interface WorkflowStep {
    action: 'navigate' | 'type' | 'click' | 'wait' | 'say' | 'select' | 'open_stock';
    selector?: string; // CSS selector for 'type', 'click', and 'select'
    value?: string | number; // Value for 'type', 'select', or 'open_stock' action
    path?: string; // URL path for 'navigate' action
    message?: string; // Message for 'say' action
    duration?: number; // Duration in ms for 'wait' action
    comment: string; // AI's thought process for this step
}

// Defines the expected JSON response from the AI
interface SignatexFlowResponse {
    steps: WorkflowStep[];
}

// Define the JSON schema for the AI response
const signatexFlowSchema = {
    type: Type.OBJECT,
    properties: {
        steps: {
            type: Type.ARRAY,
            description: "A sequence of actions to perform on the website.",
            items: {
                type: Type.OBJECT,
                properties: {
                    action: { type: Type.STRING, enum: ['navigate', 'type', 'click', 'wait', 'say', 'select', 'open_stock'] },
                    selector: { type: Type.STRING, description: "CSS selector for the target element." },
                    value: { type: Type.STRING, description: "Text to type, value to select, or stock ticker to open." },
                    path: { type: Type.STRING, description: "URL path for navigation (e.g., '/')." },
                    message: { type: Type.STRING, description: "A message to say to the user." },
                    duration: { type: Type.NUMBER, description: "How long to wait in milliseconds." },
                    comment: { type: Type.STRING, description: "A comment explaining the step." }
                },
                required: ["action", "comment"]
            }
        }
    },
    required: ["steps"]
};

/**
 * Takes a natural language prompt and returns a structured workflow plan.
 * @param prompt The user's command (e.g., "Search for Tesla and buy 5 shares").
 * @returns A promise that resolves to an object containing an array of workflow steps.
 */
export const getWorkflowFromPrompt = async (prompt: string): Promise<SignatexFlowResponse> => {
    if (!GEMINI_API_KEY) {
        throw new Error("Gemini API key not set.");
    }

    const systemPrompt = `
        You are an expert site navigator for Signatex.co, a paper trading web application. Your task is to convert a user's natural language command into a precise JSON object representing a series of actions.

        **CRITICAL RULES:**
        1.  **VIEW A STOCK WITH 'open_stock'**: To view a stock's chart or details, you MUST use the \`open_stock\` action. The \`value\` MUST be the stock ticker. The app will handle the navigation.
            -   **CORRECT**: \`{ "action": "open_stock", "value": "TSLA", "comment": "Opening the page for Tesla." }\`
            -   **INCORRECT**: \`{ "action": "navigate", "path": "/stock/TSLA" }\`
        2.  **STOCK TICKERS ONLY**: The app only supports stock tickers (e.g., AAPL, GOOG). It does NOT support cryptocurrencies (like Ethereum/ETHUSD) or forex. If a user asks for a non-stock asset, you MUST use the \`say\` action to inform them you can only handle stocks.
        3.  **NO INVENTED URLS**: Only use the \`Maps\` action for the paths explicitly listed below. Do not create your own paths.
        4.  **CHART DRAWING LIMITATION**: You CANNOT draw on the chart (e.g., trendlines). Drawing requires precise mouse movements on a canvas, which you cannot simulate. If asked to draw, you MUST use the \`say\` action to explain this limitation.

        **AVAILABLE ACTIONS & PAGES:**

        **1. View a Stock (The ONLY way):**
        -   **Action**: \`open_stock\`
        -   **Value**: The stock ticker symbol (e.g., "MSFT").

        **2. Navigation (\`Maps\` action):**
        -   Dashboard / Home: \`{ "path": "/" }\`
        -   AI Stock Picker: \`{ "path": "/picker" }\`
        
        **3. Element Selectors by Page:**

        * **Dashboard ('/')**:
            * Search Input: \`input[placeholder*="Search for a stock ticker"]\`
            * Search Button: \`button[type="submit"]\`
            * AI Stock Picker Link: \`a[href="#/picker"]\`

        * **Stock View ('/stock/:ticker')**:
            * **Chart Interval**: Use the \`select\` action with the selector \`select\`. The value can be "15min", "1hour", "4hour", "1day", "1week", or "1month".
            * **Information Tabs**:
                * Summary: \`button:contains("Summary")\`
                * News: \`button:contains("News")\`
                * Financials: \`button:contains("Financials")\`
                * Analyst Ratings: \`button:contains("Analyst Ratings")\`
                * Insider Trades: \`button:contains("Insider Trades")\`
                * AI Technical Analysis: \`button:contains("AI Technical Analysis")\`
                * Advanced Recs: \`button:contains("Advanced Recs")\`
            * **Trading Panel**:
                * Shares/Contracts Input: \`input#shares\`
                * Buy Button: \`button.bg-brand-green\`
                * Sell Button: \`button.bg-brand-red\`
                * Stock Tab: \`nav button:contains("Stock")\`
                * Calls Tab: \`nav button:contains("Calls")\`
                * Puts Tab: \`nav button:contains("Puts")\`
            * **AI Analysis Buttons**:
                * In most tabs, there is an analysis button you can click: \`button:contains("Analyze")\`

        * **AI Stock Picker ('/picker')**:
            * Get My Picks Button: \`button[type="submit"]\`
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt,
            contents: `User command: "${prompt}"`,
            config: {
                responseMimeType: "application/json",
                responseSchema: signatexFlowSchema,
            },
        });

        if (!response) throw new Error("AI response was null");

        const jsonText = response.text.trim();
        return JSON.parse(jsonText) as SignatexFlowResponse;

    } catch (error) {
        console.error("Error getting workflow from Gemini:", error);
        throw new Error("Failed to generate AI workflow.");
    }
};