import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { GEMINI_API_KEY } from '../constants';

if (!GEMINI_API_KEY) {
    console.error("Gemini API key is not configured for Signatex Flow.");
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY || '' });

// Defines the structure of a single step in the workflow
export interface WorkflowStep {
    action: 'navigate' | 'type' | 'click' | 'wait' | 'say';
    selector?: string; // CSS selector for 'type' and 'click'
    value?: string | number; // Value for 'type' action
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
                    action: { type: Type.STRING, enum: ['navigate', 'type', 'click', 'wait', 'say'] },
                    selector: { type: Type.STRING, description: "CSS selector for the target element (e.g., 'input[placeholder*=\"Search...\"]', '#buy-button')." },
                    value: { type: Type.STRING, description: "Text to type into an input field." },
                    path: { type: Type.STRING, description: "URL path for navigation (e.g., '/')." },
                    message: { type: Type.STRING, description: "A message to say to the user in the chat." },
                    duration: { type: Type.NUMBER, description: "How long to wait in milliseconds." },
                    comment: { type: Type.STRING, description: "A brief comment explaining the purpose of this step." }
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
        You are an expert site navigator for a paper trading web application. Your task is to convert a user's natural language command into a precise JSON object representing a series of actions.
        
        CORE DIRECTIVE: All actions MUST take place within this application. You cannot navigate to or pull data from external websites.

        IMPORTANT RULE (VIEWING A STOCK): To view a stock's chart or details (e.g., "show me apple stock"), you MUST follow this sequence:
        1. Navigate to the dashboard (path: '/').
        2. Type the stock ticker or name into the search input.
        3. Click the search button.
        4. Click the first search result link.
        DO NOT generate a 'navigate' action with a path like '/stock/AAPL' directly. You must use the search functionality.

        CAPABILITY LIMITATIONS:
        - You cannot perform chart drawing actions (e.g., trendlines). If asked, use a 'say' action to explain you can open the chart but cannot draw on it.
        - You cannot browse external websites. If a user mentions another site (like TradingView), use a 'say' action to explain you are limited to this app's features.

        NAVIGATION RULE: All 'navigate' actions must use internal application paths starting with '/'. You MUST NOT use absolute URLs (e.g., 'https://...').

        Here are the key elements and their selectors on the site:
        - Search Input: 'input[placeholder*="Search for a stock ticker"]'
        - Search Button: 'button[type="submit"]' (The one next to the search input)
        - First Search Result Link: 'ul > li:first-child > a'
        - Stock View Buy Button: 'button.bg-brand-green'
        - Stock View Sell Button: 'button.bg-brand-red'
        - Stock View Shares Input: 'input#shares'
        - Stock View Calls Tab: 'button:nth-child(2)' within the trade panel nav
        - Stock View Puts Tab: 'button:nth-child(3)' within the trade panel nav
        - AI Stock Picker Link: 'a[href="#/picker"]'

        Actions Available:
        - navigate: Go to an internal page. Use 'path' (e.g., "/").
        - type: Enter text into an element. Use 'selector' and 'value'.
        - click: Click an element. Use 'selector'.
        - wait: Pause for a specified time. Use 'duration' in milliseconds (e.g., 500 for half a second).
        - say: Communicate with the user. Use 'message'.

        Your goal is to create a step-by-step plan. Always use 'say' steps to explain what you're doing. Be concise. Start by navigating to the home page ('/') if the context isn't clear.
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