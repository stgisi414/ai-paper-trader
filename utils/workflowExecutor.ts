import { WorkflowStep } from '../services/signatexFlowService';
import { NavigateFunction } from 'react-router-dom';

const HIGHLIGHT_CLASS = 'signatex-flow-highlight';
let highlightedElement: HTMLElement | null = null;

/**
 * Removes the highlight from any currently highlighted element.
 */
export const cleanupHighlight = () => {
    if (highlightedElement) {
        highlightedElement.classList.remove(HIGHLIGHT_CLASS);
        highlightedElement = null;
    }
};

/**
 * Applies a highlight effect to an element and scrolls it into view.
 * @param element The HTML element to highlight.
 */
const highlightElement = (element: HTMLElement) => {
    cleanupHighlight();
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.classList.add(HIGHLIGHT_CLASS);
    highlightedElement = element;
};

/**
 * A simple delay function.
 * @param ms Milliseconds to wait.
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executes a single step of a workflow.
 * @param step The workflow step object.
 * @param navigate The react-router navigate function.
 */
export const executeStep = async (step: WorkflowStep, navigate: NavigateFunction) => {
    console.log('Executing step:', step);
    cleanupHighlight();
    await delay(300); // Small delay for smoother transitions

    switch (step.action) {
        case 'open_stock':
            // FIX: Check for 'value', 'ticker', or 'symbol' to capture all possible Planner outputs.
            const stockIdentifier = step.value || (step as any).ticker || (step as any).symbol;

            if (stockIdentifier) {
                navigate(`/stock/${String(stockIdentifier).toUpperCase()}`);
            }
            break;

        case 'change_chart_view': // NEW CASE: Handles changing the chart interval
            if (step.value) {
                // The select element for the chart interval is controlled via a <select> tag
                // and should be the one element with the value set by the chart component.
                // We assume the selector is on the <select> tag itself.
                const selectElement = document.querySelector('#chart-interval-select');
                
                if (selectElement) {
                    highlightElement(selectElement as HTMLElement);
                    await delay(1000); // Pause to show the user what's being targeted

                    const chartSelect = selectElement as HTMLSelectElement;
                    chartSelect.value = String(step.value);
                    
                    // Dispatch an event to update the parent component's state
                    chartSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    await delay(500); // Give component time to process change
                } else {
                    console.warn("Chart interval select element not found.");
                }
            }
            break;
            
        case 'navigate':
            if (step.path) {
                navigate(step.path);
            }
            break;

        case 'type':
        case 'click':
        case 'select':
        case 'scroll_to':
        case 'open_tab':
            if (!step.selector && !step.elementId) throw new Error('Selector or Element ID is missing for action: ' + step.action);
            
            // Use elementId if available, fall back to selector
            const selector = step.selector || `#${step.elementId}`; 
            const element = document.querySelector(selector) as HTMLElement;
            
            if (!element) throw new Error(`Element not found with selector: ${selector}`);
            
            highlightElement(element);
            await delay(1000); // Pause to show the user what's being targeted

            if (step.action === 'click' || step.action === 'open_tab') {
                // 'open_tab' and 'click' actions are the same at the DOM level for tabs/buttons
                element.click();
            } else if (step.action === 'type' && typeof step.value !== 'undefined') {
                const inputElement = element as HTMLInputElement;
                inputElement.value = String(step.value);
                // Dispatch an event to ensure React state updates
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (step.action === 'select' && typeof step.value !== 'undefined') {
                const selectElement = element as HTMLSelectElement;
                selectElement.value = String(step.value);
                selectElement.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (step.action === 'scroll_to') {
                // Scrolling and highlighting is handled by highlightElement, no extra action needed.
            }
            break;
            
        case 'wait':
            await delay(step.duration || 500);
            break;

        case 'research':
        case 'recommend_stocks':
        case 'say':
        case 'plan_options_strategy':
        case 'get_portfolio_rec':
             // 'say' action is handled in ChatPanel, no action needed here.
             // 'research' action is pre-processed in signatexFlowService.ts and should not reach here.
             break;
        
        default:
            console.warn(`Unknown action type: ${step.action}`);
    }

    await delay(500); // Post-action delay
};

export const processHelpAction = async () => {
    const actionJson = localStorage.getItem('signatex_help_action');
    if (actionJson) {
        localStorage.removeItem('signatex_help_action');
        cleanupHighlight();
        
        try {
            const { action, elementId } = JSON.parse(actionJson);

            // Simple actions: scroll to element, click a button/tab
            if (action === 'scroll_to' || action === 'click' || action === 'open_tab') {
                const element = document.querySelector(`#${elementId}`) as HTMLElement;
                if (element) {
                    // For tabs, click the tab button to open the content
                    if (action === 'open_tab' || action === 'click') {
                        element.click();
                        await delay(500);
                    }
                    
                    // For any action, scroll it into view and highlight it
                    highlightElement(element);
                } else {
                    console.warn(`Help action element not found: #${elementId}`);
                }
            } else if (action === 'open_chat') {
                 // For Chat actions, we just open the chat panel
                const chatButton = document.querySelector('.fixed.bottom-6.right-6 > button') as HTMLElement;
                if (chatButton) {
                    chatButton.click();
                }
            }
        } catch (e) {
            console.error("Failed to process help action from storage:", e);
        }
    }
};