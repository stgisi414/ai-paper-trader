import { GEMINI_BASE_URL } from '../constants';

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

export interface AppContext {
    currentPage: string;
    currentTicker?: string;
    portfolio?: {
        cash: number;
        holdings: { ticker: string; shares: number }[];
    };
    watchlist?: string[];
}

const buildContextPrompt = (context: AppContext): string => {
    let contextString = "**CURRENT APP CONTEXT:**\n";
    contextString += `- Current Page: ${context.currentPage}\n`;
    if (context.currentTicker) {
        contextString += `- Viewing Stock: ${context.currentTicker}\n`;
    }
    if (context.portfolio) {
        contextString += `- Portfolio Cash: $${context.portfolio.cash.toFixed(2)}\n`;
        const holdingsStr = context.portfolio.holdings.map(h => `${h.shares} shares of ${h.ticker}`).join(', ');
        if (holdingsStr) {
            contextString += `- Portfolio Holdings: ${holdingsStr}\n`;
        }
    }
    if (context.watchlist && context.watchlist.length > 0) {
        contextString += `- Watchlist: ${context.watchlist.join(', ')}\n`;
    }
    return contextString;
};

// Define the JSON schema for the AI response
const signatexFlowSchema = {
    type: "OBJECT",
    properties: {
        steps: {
            type: "ARRAY",
            description: "A sequence of actions to perform on the website.",
            items: {
                type: "OBJECT",
                properties: {
                    action: { type: "STRING", enum: ['navigate', 'type', 'click', 'wait', 'say', 'select', 'open_stock'] },
                    selector: { type: "STRING", description: "CSS selector for the target element." },
                    value: { type: "STRING", description: "Text to type, value to select, or stock ticker to open." },
                    path: { type: "STRING", description: "URL path for navigation (e.g., '/')." },
                    message: { type: "STRING", description: "A message to say to the user." },
                    duration: { type: "NUMBER", description: "How long to wait in milliseconds." },
                    comment: { type: "STRING", description: "A comment explaining the step." }
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
export const getWorkflowFromPrompt = async (prompt: string, context: AppContext): Promise<SignatexFlowResponse> => {
    const contextPrompt = buildContextPrompt(context);

    const fullPrompt = `
        You are an expert site navigator for Signatex.co, a paper trading web application. Your task is to convert a user's natural language command into a precise JSON object representing a series of actions based on the current context of the application.

        ${contextPrompt}

        **CRITICAL RULES:**
        1.  **VIEW A STOCK WITH 'open_stock'**: To view a stock's chart or details, you MUST use the \`open_stock\` action. The \`value\` MUST be the stock ticker. The app will handle the navigation.
            -   **CORRECT**: \`{ "action": "open_stock", "value": "TSLA", "comment": "Opening the page for Tesla." }\`
            -   **INCORRECT**: \`{ "action": "navigate", "path": "/stock/TSLA" }\`
        2.  **STOCK TICKERS ONLY**: The app only supports stock tickers (e.g., AAPL, GOOG). It does NOT support cryptocurrencies (like Ethereum/ETHUSD) or forex. If a user asks for a non-stock asset, you MUST use the \`say\` action to inform them you can only handle stocks.
        3.  **NO INVENTED URLS**: Only use the \`Maps\` action for the paths explicitly listed below. Do not create your own paths.
        4.  **CHART DRAWING LIMITATION**: You CANNOT draw on the chart (e.g., trendlines). Drawing requires precise mouse movements on a canvas, which you cannot simulate. If asked to draw, you MUST use the \`say\` action to explain this limitation.
        5.  **ADVANCED RECS**: To get the AI-synthesized strategy, you must first navigate to the 'Advanced Recs' tab and then click the 'Generate Strategy' button.

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
            * AI Stock Picker Link: \`a[href="/picker"]\`

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
            * **AI Analysis Buttons**:
                * In most tabs, there is an analysis button you can click: \`button:contains("Analyze")\` or \`button:contains("Generate Strategy")\`
            * **Trading Panel**:
                * Shares/Contracts Input: \`input#shares\`
                * Buy Button: \`button.bg-brand-green\`
                * Sell Button: \`button.bg-brand-red\`
                * Stock Tab: \`nav button:contains("Stock")\`
                * Calls Tab: \`nav button:contains("Calls")\`
                * Puts Tab: \`nav button:contains("Puts")\`

        * **AI Stock Picker ('/picker')**:
            * Get My Picks Button: \`button[type="submit"]\`

        User command: "${prompt}"
        Please provide only the raw JSON object in your response, without any markdown formatting.
    `;

    try {
        const response = await fetch(GEMINI_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: fullPrompt,
                model: "gemini-1.5-flash", // Using a fast model for UI navigation
                schema: signatexFlowSchema,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini proxy failed: ${errorText}`);
        }
        
        const data = await response.json();
        const cleanedText = data.text.replace(/^```json\s*/, '').replace(/```$/, '');
        return JSON.parse(cleanedText) as SignatexFlowResponse;

    } catch (error) {
        console.error("Error getting workflow from proxy:", error);
        throw new Error("Failed to generate AI workflow.");
    }
};