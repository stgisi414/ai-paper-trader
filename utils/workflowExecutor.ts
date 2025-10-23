import { WorkflowStep } from '../services/signatexFlowService';
import { NavigateFunction } from 'react-router-dom';

const HIGHLIGHT_CLASS = 'signatex-flow-highlight';
let highlightedElement: HTMLElement | null = null;

export const cleanupHighlight = () => {
    if (highlightedElement) {
        console.log('[DEBUG] Cleaning up previous highlight.');
        highlightedElement.classList.remove(HIGHLIGHT_CLASS);
        highlightedElement = null;
    }
};

const highlightElement = (element: HTMLElement) => {
    cleanupHighlight();
    console.log(`[DEBUG] Highlighting element:`, element);
    element.classList.add(HIGHLIGHT_CLASS);
    highlightedElement = element;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const MAX_RETRIES = 20;
const RETRY_DELAY_MS = 150;

/**
 * Robust polling-based function to wait for an element using async/await.
 */
const waitForElement = async (selector: string): Promise<HTMLElement | null> => {
    console.log(`[DEBUG] Starting robust waitForElement for selector: "${selector}"`);
    for (let i = 0; i < MAX_RETRIES; i++) {
        const element = document.querySelector(selector) as HTMLElement;
        if (element) {
            console.log(`[DEBUG] SUCCESS: Found element (attempt ${i + 1}):`, element);
            return element;
        }
        await delay(RETRY_DELAY_MS);
    }
    console.error(`[DEBUG] TIMEOUT: waitForElement could not find "${selector}" after multiple retries.`);
    return null;
};

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
            const stockIdentifier = step.value || (step as any).ticker || (step as any).symbol;

            if (stockIdentifier) {
                navigate(`/stock/${String(stockIdentifier).toUpperCase()}`);
            }
            break;

        case 'change_chart_view':
            if (step.value) {
                const selectElement = document.querySelector('#chart-interval-select');
                
                if (selectElement) {
                    highlightElement(selectElement as HTMLElement);
                    await delay(1000);

                    const chartSelect = selectElement as HTMLSelectElement;
                    chartSelect.value = String(step.value);
                    
                    chartSelect.dispatchEvent(new Event('change', { bubbles: true }));
                    await delay(500);
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
        case 'show_element': // ADDED: New action type from help menu
            if (!step.selector && !step.elementId) throw new Error('Selector or Element ID is missing for action: ' + step.action);
            
            // Use elementId if available, fall back to selector
            const selector = step.selector || `#${step.elementId}`; 
            
            // Find element for initial processing/highlighting (no need for retries yet)
            let element = document.querySelector(selector) as HTMLElement;
            
            if (step.action !== 'type' && step.action !== 'select') { 
                // Only use waitForElement for final display or modal clicks.
                element = await waitForElement(selector);
            }

            if (!element) throw new Error(`Element not found with selector: ${selector}`);
            
            // Special handling for opening tabs
            if (step.action === 'open_tab' || step.action === 'show_element') {
                
                // If the target is an analyze button, derive the tab button ID
                let tabButtonSelector: string | null = null;
                const tabIdMatch = step.elementId?.match(/^(\w+)-(analyze|tab)-button$/);
                
                if (tabIdMatch) {
                    // e.g., #technical-analyze-button -> #technical-tab-button
                    tabButtonSelector = `#${tabIdMatch[1]}-tab-button`;
                }
                
                if (tabButtonSelector && tabButtonSelector !== selector) {
                    // This means we need to click a different element (the tab header) first.
                    const tabButton = await waitForElement(tabButtonSelector);

                    if (tabButton) {
                        tabButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await delay(300);
                        tabButton.click();
                        
                        // We must wait for the *final* element to render inside the now-open tab
                        element = await waitForElement(selector);
                        if (!element) throw new Error(`Final element not found with selector: ${selector} inside opened tab.`);
                    }
                }
            }
            
            highlightElement(element);
            await delay(1000); // Pause to show the user what's being targeted

            if (step.action === 'click' || step.action === 'open_tab') {
                // 'open_tab' is here only if triggered by the AI assistant flow
                element.click();
            } else if (step.action === 'type' && typeof step.value !== 'undefined') {
                const inputElement = element as HTMLInputElement;
                inputElement.value = String(step.value);
                inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (step.action === 'select' && typeof step.value !== 'undefined') {
                const selectElement = element as HTMLSelectElement;
                selectElement.value = String(step.value);
                selectElement.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (step.action === 'scroll_to' || step.action === 'show_element') {
                // Do nothing more; the goal was just to highlight/scroll.
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
             break;
        
        default:
            console.warn(`Unknown action type: ${step.action}`);
    }

    await delay(500); // Post-action delay
};

/**
 * Main function to process a help action. Executed post-navigation.
 */
export const processHelpAction = async () => {
    // --- ADD UNCONDITIONAL ENTRY LOG ---
    console.log('[processHelpAction ENTRY DEBUG] Function called.');
    // --- END UNCONDITIONAL ENTRY LOG ---

    const actionJson = localStorage.getItem('signatex_help_action');
    // Log the value *immediately* after getting it
    console.log('[processHelpAction DEBUG] localStorage check:', actionJson);

    if (!actionJson) {
        console.log('[processHelpAction DEBUG] No action found in localStorage. Exiting.');
        return; // Exit if no action item
    }

    // Moved logging here to ensure it only happens if actionJson is found
    console.log('--- [DEBUG] STARTING processHelpAction (Help Menu Trigger) ---');
    localStorage.removeItem('signatex_help_action');
    cleanupHighlight();

    try {
        const { action, elementId } = JSON.parse(actionJson);
        console.log(`[DEBUG] Action parsed: action="${action}", elementId="${elementId}"`);

        // Force scroll to the top of the page immediately after navigation completes.
        window.scrollTo({ top: 0, behavior: 'instant' });
        await delay(100);

        // Actions that involve scrolling/highlighting/clicking/showing
        if (action === 'scroll_to' || action === 'click' || action === 'show_element') {

            // --- STAGE 1: TAB ACTIVATION (Only runs if target is inside a tab) ---
            const requiresTabActivation = action === 'show_element' && (elementId.endsWith('-analyze-button') || elementId.endsWith('-tab-button'));

            if (requiresTabActivation) {

                let tabButtonSelector = '';
                if (elementId.endsWith('-analyze-button')) {
                    tabButtonSelector = `#${elementId.replace('-analyze-button', '-tab-button')}`;
                } else {
                    // If the target IS the tab button itself
                    tabButtonSelector = `#${elementId}`;
                }

                const tabButton = await waitForElement(tabButtonSelector);

                if (tabButton) {
                    console.log(`[DEBUG] Activating tab: ${tabButtonSelector}`);
                    // Check if tab is already active to avoid unnecessary click/scroll
                    const isActive = tabButton.getAttribute('aria-selected') === 'true' || tabButton.classList.contains('border-brand-blue'); // Adapt based on actual active class
                    if (!isActive) {
                        tabButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await delay(300); // Wait for scroll if needed
                        tabButton.click();
                        await delay(100); // Small delay for tab content to potentially render
                    } else {
                         console.log(`[DEBUG] Tab ${tabButtonSelector} is already active.`);
                         // Still scroll to it if the action is just 'show_element' targeting the tab itself
                         if (action === 'show_element' && elementId.endsWith('-tab-button')) {
                             tabButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                             await delay(300);
                         }
                    }
                } else {
                    console.warn(`[DEBUG] Tab header button not found: ${tabButtonSelector}.`);
                }
            }

            // --- STAGE 2: FIND FINAL TARGET, SCROLL, AND HIGHLIGHT ---
            // Ensure we target the original elementId even after potential tab activation
            const selector = `#${elementId}`;

            const element = await waitForElement(selector);

            if (!element) {
                console.error(`[DEBUG] FINAL FAILURE: Element "${selector}" not found after potential tab activation.`);
                await delay(2000);
                cleanupHighlight(); // Clean up if element not found
                return;
            }

            // Scroll, wait, and highlight
            console.log(`[DEBUG] Final element found. Scrolling to view.`);
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Increased delay slightly to ensure visibility after scroll/tab switch
            await delay(800);

            highlightElement(element);

            // ONLY click if the action is explicitly 'click'
            if (action === 'click') {
                console.log(`[DEBUG] Executing final click for action: ${action}`);
                element.click();
                 await delay(500); // Delay after click
                 cleanupHighlight(); // Clean up faster after a click action
            } else {
                // For 'show_element' and 'scroll_to', keep highlight longer
                await delay(2500);
                cleanupHighlight();
            }


        } else if (action === 'open_chat') {
            const chatButton = document.querySelector('.fixed.bottom-6.right-6 > button') as HTMLElement;
            if (chatButton) {
                chatButton.click();
            }
        }
    } catch (e) {
        console.error("[DEBUG] A critical error occurred during execution:", e);
        cleanupHighlight(); // Ensure cleanup on error
    } finally {
         setTimeout(cleanupHighlight, 500);
    }
    console.log('--- [DEBUG] ENDING processHelpAction ---');
};