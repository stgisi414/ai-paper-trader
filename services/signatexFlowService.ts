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
        1.  **RESEARCH FIRST**: If the user is asking a general knowledge or research question that does *not* involve clicking a specific button on the current page (e.g., "what is a penny stock?", "what are the risks of TSLA?"), your *first* action MUST be 'research'.
            -   **DO NOT use Google Search**. Use the powerful tools available to you.
            -   The 'research' action should be followed by a 'say' action to summarize the findings. The 'message' field of the 'research' step should contain the query for the research tool.
            -   **Example Research Flow:**
                \`[ { "action": "research", "message": "what is a penny stock?", "comment": "Checking external knowledge base." }, { "action": "say", "message": "[The result from the 'research' step goes here]", "comment": "Responding to the user's inquiry." } ]\`
        2.  **VIEW A STOCK WITH 'open_stock'**: To view a stock's chart or details, you MUST use the \`open_stock\` action.
        3.  **NO INVENTED URLS**: Only use the \`path\` action for the paths explicitly listed below.
        4.  **CHART DRAWING LIMITATION**: You CANNOT draw on the chart. Use the \`say\` action to explain this limitation.
        5.  **STOCK TICKERS ONLY**: The app only supports stock tickers (e.g., AAPL, GOOG).

        **AVAILABLE ACTIONS & PAGES:**

        * **NEW: Research Action**:
            * **Action**: \`research\`
            * **Message**: The specific research query (e.g., "define penny stock").
            
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
        const response = await fetch(GEMINI_BASE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: fullPrompt,
                model: "gemini-2.5-flash", // Using a fast model for UI navigation
                schema: signatexFlowSchema,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini proxy failed: ${errorText}`);
        }
        
        const data = await response.json();
        const cleanedText = data.text.replace(/^```json\s*/, '').replace(/```$/, '');
        
        // --- ADDITION: Process 'research' result before returning ---
        let responseJson: SignatexFlowResponse = JSON.parse(cleanedText);
        
        if (responseJson.steps.length > 0 && responseJson.steps[0].action === 'research') {
             const researchInstructions = "You are an expert financial research assistant. Your task is to use the Google Search tool to answer the following user query. The answer must be highly relevant to financial markets, stock trading, or investment concepts. Provide a concise, factual, and friendly response in no more than three sentences. Directly address the user's query and do not include any markdown formatting (like bolding, italics, or lists) in your final response text.";
             const researchQuery = responseJson.steps[0].message;

             const researchPrompt = `
               ${researchInstructions}

               User Query: ${researchQuery}
             `;
             
             // --- CALL GEMINI RESEARCH API ---
             const researchResponse = await fetch(GEMINI_BASE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: researchPrompt,
                    model: "gemini-2.5-flash",
                    googleSearch: true, // Use Google Search for grounding
                })
            });
            const researchData = await researchResponse.json();
            console.log(researchData);
            const researchText = researchData.text || "I was unable to find an answer for that query.";
            // ------------------------------------

            // Replace the 'research' step with the first 'say' step, inserting the research result
            if (responseJson.steps.length > 1 && responseJson.steps[1].action === 'say') {
                 // Update the message of the planned 'say' action
                responseJson.steps[1].message = researchText;
            } else {
                 // Fallback: If no 'say' step was planned, insert one.
                 responseJson.steps.splice(1, 0, {
                     action: 'say',
                     message: researchText,
                     comment: 'Inserting AI research result.'
                 });
            }
            // Remove the initial 'research' command step
            responseJson.steps.shift(); 
        }

        return responseJson;

    } catch (error) {
        console.error("Error getting workflow from proxy:", error);
        throw new Error("Failed to generate AI workflow.");
    }
};
