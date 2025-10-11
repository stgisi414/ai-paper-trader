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
            
        case 'navigate':
            if (step.path) {
                navigate(step.path);
            }
            break;

        case 'type':
        case 'click':
        case 'select':
            if (!step.selector) throw new Error('Selector is missing for action: ' + step.action);
            const element = document.querySelector(step.selector) as HTMLElement;
            if (!element) throw new Error(`Element not found with selector: ${step.selector}`);
            
            highlightElement(element);
            await delay(1000); // Pause to show the user what's being targeted

            if (step.action === 'click') {
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
            }
            break;
            
        case 'wait':
            await delay(step.duration || 500);
            break;

        case 'research':
        case 'say':
             // 'say' action is handled in ChatPanel, no action needed here.
             // 'research' action is pre-processed in signatexFlowService.ts and should not reach here.
             break;
        
        default:
            console.warn(`Unknown action type: ${step.action}`);
    }

    await delay(500); // Post-action delay
};