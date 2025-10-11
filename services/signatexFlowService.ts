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
            description: "A sequence of actions to perform on the website or a research request.",
            items: {
                type: "OBJECT",
                properties: {
                    action: { type: "STRING", enum: ['navigate', 'type', 'click', 'wait', 'say', 'select', 'open_stock', 'research'] }, // MODIFIED: Added 'research'
                    selector: { type: "STRING", description: "CSS selector for the target element." },
                    value: { type: "STRING", description: "Text to type, value to select, or stock ticker to open." },
                    path: { type: "STRING", description: "URL path for navigation (e.g., '/')." },
                    message: { type: "STRING", description: "A message to say to the user, OR the answer/research result if action is 'research'." },
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
 * @param prompt The user's command (e.g., "Buy 10 shares of AAPL").
 * @returns A promise that resolves to an object containing an array of workflow steps.
 */
export const getWorkflowFromPrompt = async (prompt: string, context: AppContext): Promise<SignatexFlowResponse> => {
    const contextPrompt = buildContextPrompt(context);

    const fullPrompt = `
        You are an expert financial assistant for Signatex.co. Your primary goal is to fulfill user requests by either performing site actions or providing information via research.

        ${contextPrompt}

        **CRITICAL RULES:**
        1.  **TOOL-POWERED DATA RETRIEVAL**: If the user asks for financial data (e.g., 'price', 'news', 'options') for any ticker, your *first* action MUST be 'research'.
            -   The 'message' field of the 'research' step MUST be a single, direct command to the underlying tool-calling model.
            -   // MODIFICATION TO CRITICAL RULE EXAMPLE
            -   **Example Research Query for Options**: \`Get current quote and next available call options chain for NNE.\`
            -   **Example Research Query for Profile**: \`Get company profile for GOOG.\`
            -   The 'research' action should be followed by a 'say' action to summarize the findings. The 'message' field of the 'say' step should be \`[The result from the 'research' step goes here]\`.
        2.  **VIEW A STOCK WITH 'open_stock'**: To view a stock's chart or details, you MUST use the \`open_stock\` action.
        3.  **NO INVENTED URLS**: Only use the \`path\` action for the paths explicitly listed below.
        4.  **CHART DRAWING LIMITATION**: You CANNOT draw on the chart. Use the \`say\` action to explain this limitation.
        5.  **STOCK TICKERS ONLY**: The app only supports stock tickers (e.g., AAPL, GOOG).
        6.  **JSON FORMAT**: You MUST wrap the array of steps in an object with the key "steps".

        **AVAILABLE ACTIONS & PAGES:**

        * **NEW: Research Action**:
            * **Action**: \`research\`
            * **Message**: The specific research query for the tool. This query will be executed by an advanced model with access to tools like \`get_fmp_data\` and \`get_options_chain\`.

        * **Site Control Actions (Use when possible):**
            * \u0060open_stock\u0060, \u0060navigate\u0060, \u0060type\u0060, \u0060click\u0060, \u0060select\u0060, \u0060wait\u0060, \u0060say\u0060

        * **Navigation (\`path\` action):**
            * Dashboard / Home: \`{ "path": "/" }\`
            * AI Stock Picker: \`{ "path": "/picker" }\`
            * History: \`{ "path": "/history" }\`
            
        * **Element Selectors...** (omitted, assume structure remains the same)

        User command: "${prompt}"
        Please provide only the raw JSON object in your response, without any markdown formatting.
    `;

    try {
        const response = await fetch('/geminiProxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: fullPrompt,
                // CRITICAL FIX #1: Enable tools for flow requests
                enableTools: true, 
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI proxy failed: ${errorText}`);
        }
        
        const data = await response.json();
        // The API returns the raw text, which we clean up.
        const cleanedText = data.text.replace(/^```json\s*/, '').replace(/```$/, '').trim();

        let responseJson: SignatexFlowResponse | WorkflowStep[] | WorkflowStep = JSON.parse(cleanedText);
        
        // CRITICAL FIX #1: Handle raw array OR single object returned instead of { steps: [...] }
        if (Array.isArray(responseJson)) {
            responseJson = { steps: responseJson } as SignatexFlowResponse;
        } else if (typeof responseJson === 'object' && responseJson !== null && 'action' in responseJson) {
            responseJson = { steps: [responseJson] } as SignatexFlowResponse;
        }
        
        // Ensure 'steps' property exists after the check
        if (!responseJson.steps) {
            console.error("AI returned valid JSON but missing 'steps' array:", responseJson);
            throw new Error("AI response was corrupted and missing the mandatory 'steps' array.");
        }

        let finalResponse = responseJson as SignatexFlowResponse;
        
        if (finalResponse.steps.length > 0 && finalResponse.steps[0].action === 'research') {
             const researchQuery = finalResponse.steps[0].message;

             const researchResponse = await fetch('/geminiProxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // CRITICAL FIX: Direct the inner model to ONLY use tools or clearly state failure.
                    // We feed the researchQuery directly back, but with a forceful instruction.
                    prompt: `I have access to the following tools: 'get_fmp_data' (for financial/quote data) and 'get_options_chain' (for options data). Respond to this request ONLY by using one or more of these tools and chaining them if necessary, or by providing a factual text response if the data cannot be found or the request is not fully addressed by the tools. The user request is: "${researchQuery}"`,
                    enableTools: true,
                })
            });
            const researchData = await researchResponse.json();
            console.log(researchData);
            const researchText = researchData.text || "I was unable to find an answer for that query.";

            if (responseJson.steps.length > 1 && responseJson.steps[1].action === 'say') {
                responseJson.steps[1].message = researchText;
            } else {
                 responseJson.steps.splice(1, 0, {
                     action: 'say',
                     message: researchText,
                     comment: 'Inserting AI research result.'
                 });
            }
            responseJson.steps.shift(); 
        }

        return responseJson;

    } catch (error) {
        console.error("Error getting workflow from proxy:", error);
        throw new Error("Failed to generate AI workflow.");
    }
};
