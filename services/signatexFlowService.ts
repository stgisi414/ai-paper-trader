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

    // Prompt for the "Planner" AI. Its only job is to create a JSON workflow.
    const plannerPrompt = `
        You are an expert financial assistant for Signatex.co. Your ONLY goal is to fulfill the user's request by generating a JSON object that defines a series of actions.

        ${contextPrompt}

        **CRITICAL RULES:**
        1.  If the user asks for information (like price, news, or options), your first and ONLY step MUST be \`"action": "research"\`.
        2.  The \`message\` for the "research" step must be a clear, direct command for another AI that has tool access. Example: "Get the current stock price and the next available options chain for MSFT."
        3.  If the user wants to navigate or interact (e.g., "buy 10 shares"), generate the appropriate workflow steps (\`open_stock\`, \`click\`, etc.).
        4.  You MUST ONLY output a raw JSON object with a "steps" array. Do not add any other text.

        **User command: "${prompt}"**
    `;

    try {
        // --- Step 1: Get the plan from the Planner AI ---
        const plannerResponse = await fetch('/geminiProxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: plannerPrompt,
                enableTools: false, // The planner does not need tools.
            }),
        });

        if (!plannerResponse.ok) throw new Error(`Planner AI failed: ${await plannerResponse.text()}`);
        
        const planData = await plannerResponse.json();
        const workflow = JSON.parse(planData.text) as SignatexFlowResponse;

        // --- Step 2: Check if the plan requires research ---
        const researchStep = workflow.steps.find(step => step.action === 'research');
        if (researchStep && researchStep.message) {
            console.log("Research step found. Executing with actor AI...");

            // Prompt for the "Actor" AI. Its only job is to use tools to answer a question.
            const actorPrompt = `
                Your only task is to answer the following user request by calling one or more of the provided tools ('get_fmp_data', 'get_options_chain').
                Chain tools if necessary. Respond with only the final, summarized, human-readable answer as plain text. Do not add conversational filler.
                Request: "${researchStep.message}"
            `;
            
            const actorResponse = await fetch('/geminiProxy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: actorPrompt,
                    enableTools: true, // The actor MUST have tools enabled.
                }),
            });

            if (!actorResponse.ok) throw new Error(`Actor AI failed: ${await actorResponse.text()}`);
            
            const actorData = await actorResponse.json();
            const researchResultText = actorData.text;

            // Replace the research step with a 'say' step containing the result.
            return {
                steps: [{
                    action: 'say',
                    message: researchResultText,
                    comment: 'Result from AI research.'
                }]
            };
        }

        // If no research was needed, return the original workflow.
        return workflow;

    } catch (error) {
        console.error("Error in getWorkflowFromPrompt:", error);
        return { steps: [{ action: 'say', message: 'Sorry, I ran into a critical error.', comment: 'Workflow generation failed.' }] };
    }
};