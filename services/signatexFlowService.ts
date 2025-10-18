import { AppContext, WorkflowStep } from '../types';
import { NavigateFunction } from 'react-router-dom';
import * as fmpService from './fmpService';
import { formatCurrency } from '../utils/formatters';
import { callGeminiProxyWithSchema, getStockPicks, getOptionsStrategy, getPortfolioRecommendation, AuthFunctions } from './geminiService';

// Defines the structure of a single step in the workflow
// Note: These are also exported from types.ts now for consistency
// export interface WorkflowStep { ... }
// export interface AppContext { ... }

// Defines the expected JSON response from the AI
interface SignatexFlowResponse {
    steps: WorkflowStep[];
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
                    action: { type: "STRING", enum: ['navigate', 'type', 'click', 'wait', 'say', 'select', 'open_stock', 'research', 'change_chart_view', 'recommend_stocks', 'plan_options_strategy', 'get_portfolio_rec'] }, // MODIFICATION: Added 'get_portfolio_rec'
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

const pickCriteriaSchema = {
    type: "OBJECT",
    properties: {
        risk: { type: "STRING", enum: ['low', 'medium', 'high'], description: "Inferred risk level from the query, or 'medium' if not specified." },
        strategy: { type: "STRING", enum: ['growth', 'value', 'dividends', 'undervalued'], description: "Inferred investment strategy, or 'growth' if not specified." },
        sectors: { type: "ARRAY", items: { type: "STRING" }, description: "Specific sectors mentioned (e.g., ['Technology', 'Healthcare']). Empty array if none are specified." },
        stockCount: { type: "STRING", enum: ['few', 'several', 'many'], description: "The number of stocks requested ('few' for 1-5, 'several' for 6-10, 'many' for 10+). Set to 'few' if not specified." },
    },
    required: ["risk", "strategy", "sectors", "stockCount"]
};

/**
 * Takes a natural language prompt and returns a structured workflow plan.
 * @param prompt The user's command (e.g., "Buy 10 shares of AAPL").
 * @returns A promise that resolves to an object containing an array of workflow steps.
 */
export const getWorkflowFromPrompt = async (prompt: string, context: AppContext, auth: AuthFunctions): Promise<SignatexFlowResponse> => {
    const contextPrompt = buildContextPrompt(context);

    // Prompt for the "Planner" AI. Its only job is to create a JSON workflow.
    const plannerPrompt = `
        You are an expert financial assistant for Signatex.co. Your ONLY goal is to fulfill the user's request by generating a JSON object that defines a series of actions.

        ${contextPrompt}

        **CRITICAL RULES:**
        1.  If the user asks for information (like price, news, or options), your first and ONLY step MUST be \`"action": "research"\`.
        2.  The \`message\` for the "research" step must be a clear, direct command for another AI that has tool access. Example: "Get the current stock price and the next available options chain for MSFT."
        3.  If the user asks for **generic stock ideas or recommendations (e.g., "popular stocks," "stock to buy," "list of tickers")**, your first and ONLY step MUST be \`"action": "recommend_stocks"\`. Set \`"message"\` to a descriptive string.
        4.  If the user wants to navigate or interact (e.g., "buy 10 shares"), generate the appropriate workflow steps (\`open_stock\`, \`click\`, etc.).
        5.  You MUST output a raw JSON object with a "steps" array. **Every step MUST include a descriptive 'comment' field.** Do not add any other text.
        6.  The action \`change_chart_view\` is used to update the interval of the currently viewed stock chart.

        **User command: "${prompt}"**
        
        // ADDITIONAL INSTRUCTION FOR TRADE ACTIONS:
        // If the user requests to buy/sell a specific quantity of shares for a stock:
        // 1. If not on the correct page, use 'open_stock' with the ticker/value.
        // 2. Immediately follow with:
        //    a. An action: 'click', selector: 'button[data-cy="trade-tab-stock"]', comment: 'Select the Stock trade tab.'
        //    b. An action: 'type', selector: '#shares', value: <NUMBER>, comment: 'Input the desired number of shares.'
        // 3. For any remaining ambiguity (like clicking the final Buy button), just use 'say' or leave it to the user.

        // NEW INSTRUCTION for Chart/View Changes:
        // If the user requests to change the chart's time period or zoom level (e.g., "show AAPL on a 1-hour chart" or "change chart to monthly"):
        // 1. Use action: 'open_stock' with the ticker/value to navigate to the stock view if needed.
        // 2. Immediately follow with:
        //    a. action: 'change_chart_view', selector: '<TICKER>', value: '<INTERVAL>', comment: 'Set the chart interval.'
        // 3. The \`message\` for the "research" step must be a clear, direct command for another AI that has tool access. Example: "Get the current stock price and the next available options chain for MSFT."
        // 4. If the user asks for **generic stock ideas or recommendations (e.g., "popular stocks," "stock to buy," "list of tickers")**, your first and ONLY step MUST be \`"action": "recommend_stocks"\`. Set \`"message"\` to a descriptive string.
        // 5. If the user requests a **specific options trade or strategy (e.g., "bullish strategy for TSLA," "sell a covered call on GOOGL")**, your first and ONLY step MUST be \`"action": "plan_options_strategy"\`. Set \`"message"\` to the full user prompt.
        // 6. If the user wants to navigate or interact (e.g., "buy 10 shares"), generate the appropriate workflow steps (\`open_stock\`, \`click\`, etc.).

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
        const cleanedText = planData.text.replace(/^```json\s*|\s*```$/g, '').trim();
        const workflow = JSON.parse(cleanedText) as SignatexFlowResponse;

        // --- Step 2: Determine model, check usage, and log it ---
        const firstStep = workflow.steps[0];
        const isMaxAction = firstStep && ['plan_options_strategy', 'get_portfolio_rec'].includes(firstStep.action);
        const modelToCharge = isMaxAction ? 'max' : 'lite';

        if (!auth.checkUsage(modelToCharge)) {
            auth.onLimitExceeded(modelToCharge);
            throw new Error('Usage limit exceeded');
        }
        
        // Log usage for the entire operation before proceeding.
        await auth.logUsage(modelToCharge);

        // --- Step 3: Check if the plan requires an immediate AI action (research, recs, etc.) ---
        const researchStep = workflow.steps.find(step => step.action === 'research');
        if (researchStep && researchStep.message) {
            console.log("Research step found. Executing with actor AI...");

            const actorPrompt = `
                Your only task is to fulfill the user's Request by calling the appropriate tool(s) and summarizing the results into a single, concise, human-readable sentence or paragraph.
                Do not add conversational filler, do not include code, and do not ask if you should proceed. 
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

        const recommendStocksStep = workflow.steps.find(step => step.action === 'recommend_stocks');
        if (recommendStocksStep && recommendStocksStep.message) {
             console.log("Recommend stocks step found. Executing client-side AI picks...");
             
             try {
                 // Use the AI to extract structured criteria from the user's free-form prompt
                 const criteriaPrompt = `Analyze the user request: "${recommendStocksStep.message}". Extract the user's implied stock criteria, defaulting to 'medium' risk, 'growth' strategy, and 'few' count if not explicitly mentioned. Return a JSON object strictly conforming to the pickCriteriaSchema.`;
                 
                 const extractedCriteria = await callGeminiProxyWithSchema(criteriaPrompt, "gemini-2.5-flash", pickCriteriaSchema, auth) as typeof pickCriteriaSchema.properties;
                 
                 const finalAnswers = {
                     risk: extractedCriteria.risk || 'medium',
                     strategy: extractedCriteria.strategy || 'growth',
                     sectors: extractedCriteria.sectors || [],
                     stockCount: extractedCriteria.stockCount || 'few', 
                 };
                 
                 console.log("Extracted stock pick criteria:", finalAnswers);
                 
                 const picksResult = await getStockPicks(finalAnswers, auth);
                 
                 const symbols = picksResult.stocks.map(p => p.symbol).join(',');
                 const quotes = await fmpService.getQuote(symbols);
                 
                 const picksList = picksResult.stocks.map(p => {
                     const quote = quotes.find(q => q.symbol === p.symbol);
                     const name = quote?.name || 'N/A'; 
                     return `${p.symbol} (${name}) - Rationale: ${p.reason}`;
                 }).join('\n');
                 
                 const resultText = picksList.length > 0 
                     ? `Based on your request for stock ideas, here are some options:\n${picksList}`
                     : "I couldn't generate any specific stock recommendations based on default criteria.";

                 // Replace the recommend_stocks step with a 'say' step containing the result.
                 return {
                     steps: [{
                         action: 'say',
                         message: resultText,
                         comment: 'Result from AI stock recommendation.'
                     }]
                 };
             } catch (error) {
                 console.error("Error executing stock recommendation:", error);
                 return { steps: [{ action: 'say', message: 'Sorry, I failed to get stock picks from the AI service.', comment: 'Stock picking failed.' }] };
             }
        }

        const planOptionsStrategyStep = workflow.steps.find(step => step.action === 'plan_options_strategy');
        if (planOptionsStrategyStep && planOptionsStrategyStep.message) {
            console.log("Plan options strategy step found. Executing client-side AI strategy planner...");
            
            try {
                // Determine the ticker from the prompt. Fallback to currentTicker if possible.
                const tickerMatch = planOptionsStrategyStep.message.match(/\b[A-Z]{2,5}\b/);
                const stockTicker = tickerMatch ? tickerMatch[0] : context.currentTicker;

                if (!stockTicker) {
                    throw new Error("Could not determine stock ticker for options strategy.");
                }

                const strategyRecResponse: any = await getOptionsStrategy(planOptionsStrategyStep.message, stockTicker, auth);

                const strategyRec = JSON.parse(strategyRecResponse.text.replace(/^```json\s*|\s*```$/g, ''));

                let strategyText = `**Strategy: ${strategyRec.strategyName || 'N/A'} for ${stockTicker}**\n\n`;
                strategyText += `**Market Outlook:** ${strategyRec.marketOutlook || 'N/A'}\n`;
                
                const riskProfile = typeof strategyRec.riskProfile === 'string' ? strategyRec.riskProfile : 'N/A (AI Error)';
                const profitProfile = typeof strategyRec.profitProfile === 'string' ? strategyRec.profitProfile : 'N/A (AI Error)';
                strategyText += `**Risk/Profit:** ${riskProfile} / ${profitProfile}\n\n`;
                
                strategyText += `**Description:** ${strategyRec.description || 'N/A'}\n\n`;

                if (strategyRec.keyMetrics) {
                    const metrics = strategyRec.keyMetrics;
                    strategyText += `**Key Metrics:**\n`;
                    strategyText += `- Underlying Price: ${formatCurrency(metrics.underlyingPrice)}\n`;
                    strategyText += `- Max Profit: ${formatCurrency(metrics.maxProfit)}\n`; 
                    strategyText += `- Max Loss: ${formatCurrency(metrics.maxLoss)}\n`;
                    strategyText += `- Breakeven: ${formatCurrency(metrics.breakevenPrice)}\n\n`; 
                }

                strategyText += "**Suggested Contracts:**\n";
                
                if (strategyRec.suggestedContracts && strategyRec.suggestedContracts.length > 0) {
                    strategyRec.suggestedContracts.forEach((c: any) => {
                        const strikePrice = c.strikePrice || c.strike;
                        const premium = c.premium;
                        const expiration = c.expirationDate || c.expiry;
                        const formattedStrike = typeof strikePrice === 'number' ? formatCurrency(strikePrice) : 'N/A';
                        const formattedPremium = typeof premium === 'number' ? formatCurrency(premium) : 'N/A';
                        
                        strategyText += `- **${c.action.toUpperCase()} ${c.type.toUpperCase()}** @ ${formattedStrike} (Exp: ${expiration || 'N/A'})\n`;
                        strategyText += `  - Premium: ${formattedPremium}\n`;
                        strategyText += `  - Rationale: *${c.rationale}*\n`;
                    });
                } else {
                    strategyText += `- No specific contracts were suggested.\n`;
                }

                strategyText += `\n**Commentary:** ${strategyRec.commentary || 'N/A'}`;

                return {
                    steps: [{
                        action: 'say',
                        message: strategyText,
                        comment: 'Result from AI options strategy planner.'
                    }]
                };

            } catch (error) {
                console.error("Error executing options strategy planning:", error);
                const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during strategy planning.";
                return { steps: [{ action: 'say', message: `Sorry, I failed to plan the options strategy: ${errorMessage}`, comment: 'Options planning failed.' }] };
            }
        }

        const portfolioRecStep = workflow.steps.find(step => step.action === 'get_portfolio_rec');
        if (portfolioRecStep && portfolioRecStep.message && context.portfolio) {
            console.log("Portfolio recommendation step found. Executing client-side AI...");
            
            try {
                const recommendation: any = await getPortfolioRecommendation(
                    portfolioRecStep.message, 
                    context.portfolio as any,
                    auth,
                    context.currentTicker
                );

                let recText = `**Recommendation:** ${recommendation.recommendationType || 'N/A'}\n`;
                recText += `**Target Ticker:** ${recommendation.targetTicker || 'General Market'}\n`;
                
                if (recommendation.suggestedQuantity && typeof recommendation.suggestedQuantity === 'number') {
                    recText += `**Suggested Qty:** ${recommendation.suggestedQuantity}\n`;
                }
                if (recommendation.currentExposurePercent !== null && typeof recommendation.currentExposurePercent === 'number') {
                    recText += `**Sector Exposure:** ${recommendation.currentExposurePercent.toFixed(1)}%\n`;
                }

                recText += `\n**Justification:** ${recommendation.actionJustification || 'N/A'}`;

                return {
                    steps: [{
                        action: 'say',
                        message: recText,
                        comment: 'Result from AI portfolio manager recommendation.'
                    }]
                };

            } catch (error) {
                console.error("Error executing portfolio recommendation:", error);
                const errorMessage = error instanceof Error ? error.message : "Unknown error.";
                return { steps: [{ action: 'say', message: `Sorry, I failed to generate portfolio advice: ${errorMessage}`, comment: 'Portfolio advice failed.' }] };
            }
        }

        // If no special AI action was needed, return the original workflow.
        return workflow;

    } catch (error) {
        console.error("Error in getWorkflowFromPrompt:", error);
        if ((error as Error).message === 'Usage limit exceeded') {
            throw error;
        }
        return { steps: [{ action: 'say', message: 'Sorry, I ran into a critical error.', comment: 'Workflow generation failed.' }] };
    }
};

