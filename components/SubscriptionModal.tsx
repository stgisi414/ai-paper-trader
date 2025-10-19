import React, { useState } from 'react';
import { createStripeCheckoutSession, redirectToStripeCustomerPortal } from '../services/stripeService';
import Spinner from './common/Spinner';
import { SignatexMaxIcon, SignatexLiteIcon } from './common/Icons';
import { useAuth } from '../src/hooks/useAuth';

// --- Placeholder Stripe Price IDs ---
// !!! IMPORTANT: Replace these with your actual Stripe Price IDs once created !!!
const STRIPE_STARTER_PRICE_ID_MONTHLY = 'price_1SJiJfGYNyUbUaQ66dsLoGZ2';
const STRIPE_STANDARD_PRICE_ID_MONTHLY = 'price_1SJiLUGYNyUbUaQ6SQmPLRu7';
const STRIPE_PRO_PRICE_ID_MONTHLY = 'price_1SJiQCGYNyUbUaQ6csbXHGPM';
// ---

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    reason?: string; // Optional message explaining why the modal appeared
}

// Define plan details consistent with PricingPage.tsx
const plans = [
  {
    name: "Starter",
    price: "$10/mo",
    priceId: STRIPE_STARTER_PRICE_ID_MONTHLY,
    features: ["10 Signatex Max usages", "100 Signatex Lite usages", "Full paper trading access"],
    borderColor: 'border-gray-500' // Example border color
  },
  {
    name: "Standard",
    price: "$20/mo",
    priceId: STRIPE_STANDARD_PRICE_ID_MONTHLY,
    features: ["25 Signatex Max usages", "250 Signatex Lite usages", "Full paper trading access", "Priority market data"],
    borderColor: 'border-blue-500' // Example border color
  },
  {
    name: "Pro",
    price: "$40/mo",
    priceId: STRIPE_PRO_PRICE_ID_MONTHLY,
    features: ["Unlimited Signatex Max usages", "Unlimited Signatex Lite usages", "Full paper trading access", "Advanced charting tools", "Dedicated support"], // Updated Pro features
    borderColor: 'border-yellow-500' // Example border color
  },
];


const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, reason }) => {
    const { user, isPro } = useAuth();
    // Use an object to track loading state per priceId
    const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
    const [isLoadingPortal, setIsLoadingPortal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubscribeWrapper = (priceId: string, planName: string) => (event: React.MouseEvent) => {
        // Prevent default button behavior if any, and stop propagation
        event.preventDefault();
        event.stopPropagation();
        // Call the actual async handler
        handleSubscribe(priceId, planName);
    };

    const handleSubscribe = async (priceId: string, planName: string) => {
        console.log(`[handleSubscribe] Attempting subscription for plan: ${planName}, priceId: ${priceId}`); // Log entry
        if (!user) {
            console.error("[handleSubscribe] Error: User not logged in.");
            setError("You must be logged in to subscribe.");
            return;
        }
        console.log(`[handleSubscribe] User ID: ${user.uid}`); // Log user ID
        setError(null);
        setIsLoading(prev => ({ ...prev, [priceId]: true }));

        try {
            console.log("[handleSubscribe] Calling createStripeCheckoutSession..."); // Log before call
            await createStripeCheckoutSession(priceId);
            console.log("[handleSubscribe] createStripeCheckoutSession finished (should redirect)."); // Log after call (might not be reached if redirect happens)
            // Redirect happens in stripeService if successful
        } catch (err) {
            // Keep existing error handling
            console.error(`[handleSubscribe] Checkout for ${planName} failed:`, err);
            const errorMessage = (err instanceof Error && err.message) ? err.message : "An unexpected error occurred during checkout.";
            setError(errorMessage);
            setIsLoading(prev => ({ ...prev, [priceId]: false }));
        }
        // No finally block needed here, loading is cleared on error or redirect happens
    };

     const handleManageSubscriptionWrapper = (event: React.MouseEvent) => {
        // Prevent default button behavior if any, and stop propagation
        event.preventDefault();
        event.stopPropagation();
        // Call the actual async handler
        handleManageSubscription();
     };

    const handleManageSubscription = async () => {
        setError(null);
        setIsLoadingPortal(true);
        try {
            await redirectToStripeCustomerPortal();
            // Page will redirect
        } catch (err) {
            console.error("Failed to redirect to customer portal:", err);
            const errorMessage = (err instanceof Error && err.message) ? err.message : "Could not open the billing portal.";
            setError(errorMessage);
        } finally {
             // Ensure loading state is always reset
             setIsLoadingPortal(false);
        }
    };


    if (!isOpen) {
        return null;
    }

    // Determine current plan based on isPro (can be expanded later if more tiers exist)
    const currentPlanName = isPro ? "Pro" : "Basic/Free"; // Assuming non-Pro is Basic/Free

    // --- ADD LOGGING HERE ---
    console.log("[SubscriptionModal Render] Error State:", error);
    console.log("[SubscriptionModal Render] Reason Prop:", reason);
    // --- END LOGGING ---

    return (
        <div className="fixed inset-0 bg-night-900 bg-opacity-80 flex justify-center items-center z-50 p-4 transition-opacity duration-300">
            {/* Increased max-width for better layout with 3 plans */}
            <div className="bg-night-800 rounded-lg shadow-2xl w-full max-w-3xl relative animate-fade-in-up max-h-[90vh] overflow-y-auto">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1 rounded-full text-night-500 hover:bg-night-600 hover:text-white transition-colors z-10" // Ensure button is above content
                    aria-label="Close subscription modal"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>

                <div className="p-6">
                    <h2 className="text-2xl font-bold text-center mb-2 text-yellow-400">
                        {isPro ? 'Manage Subscription' : 'Choose Your Plan'}
                    </h2>
                    <p className="text-center text-sm text-night-400 mb-4">
                        Current Plan: <span className="font-semibold">{currentPlanName}</span>
                    </p>

                    {/* Check 'reason' carefully */}
                    {reason && !isPro && (
                        <p className="text-center text-sm text-yellow-500 mb-4 bg-night-700 p-2 rounded">
                            {typeof reason === 'string' ? reason : 'Invalid reason type'}
                        </p>
                    )}

                    {/* Check 'error' carefully */}
                    {error && typeof error === 'string' && (
                        <p className="text-center text-sm text-red-500 mb-4">{error}</p>
                    )}
                    {/* Log if error is not a string, but don't try to render it */}
                    {error && typeof error !== 'string' && (
                        console.error("[SubscriptionModal Render Error] 'error' state contained a non-string:", error)
                        // Optionally render a generic static message instead of crashing
                        // <p className="text-center text-sm text-red-500 mb-4">An unexpected error occurred.</p>
                    )}

                    {isPro ? (
                        <div className="text-center mt-6">
                            <p className="text-night-100 mb-6">You have unlimited access with the Pro plan!</p>
                            <button
                                onClick={handleManageSubscriptionWrapper}
                                disabled={isLoadingPortal}
                                className="w-full max-w-xs mx-auto bg-gray-600 text-white font-bold py-2 px-4 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isLoadingPortal ? <Spinner /> : 'Manage Billing & Subscription'}
                            </button>
                        </div>
                    ) : (
                        // Display all plans for Basic/Free users
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                            {plans.map((plan) => (
                                <div key={plan.name} className={`bg-night-700 p-4 rounded-lg shadow-lg border-t-4 ${plan.borderColor} flex flex-col justify-between`}>
                                    <div>
                                        <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                                        <p className="text-2xl font-extrabold text-blue-400 mb-3">{plan.price}</p>
                                        <ul className="list-disc list-inside space-y-2 text-xs text-night-200 mb-4 h-32"> {/* Fixed height for alignment */}
                                             {plan.features.map((feature, index) => {
                                                  // Use icons for AI usage features
                                                  const featureContent = typeof feature === 'string' ? feature : 'Invalid feature'; // Fallback
                                                  if (featureContent.includes('Signatex Max')) {
                                                      return (
                                                      <li key={index} className="flex items-center gap-1.5">
                                                          <SignatexMaxIcon className="h-4 w-4 text-yellow-500 flex-shrink-0" />
                                                          <span>{featureContent}</span>
                                                      </li>
                                                      );
                                                  }
                                                  if (featureContent.includes('Signatex Lite')) {
                                                      return (
                                                      <li key={index} className="flex items-center gap-1.5">
                                                          <SignatexLiteIcon className="h-4 w-4 text-blue-400 flex-shrink-0" />
                                                          <span>{featureContent}</span>
                                                      </li>
                                                      );
                                                  }
                                                  return <li key={index}>{feature}</li>;
                                              })}
                                        </ul>
                                    </div>
                                    <button
                                        onClick={() => handleSubscribeWrapper(plan.priceId, plan.name)}
                                        disabled={isLoading[plan.priceId]} // Check loading state for this specific plan
                                        className={`w-full mt-4 font-bold py-2 px-4 rounded-md transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                                            plan.name === 'Pro'
                                            ? 'bg-yellow-500 text-night-900 hover:bg-yellow-600'
                                            : 'bg-blue-500 text-white hover:bg-blue-600'
                                        }`}
                                    >
                                        {isLoading[plan.priceId] ? <Spinner /> : `Choose ${plan.name}`}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                     {/* Manage link always available for logged-in users, but maybe less prominent if not Pro */}
                     {user && !isPro && (
                         <div className="text-center mt-6">
                            <button
                                onClick={handleManageSubscriptionWrapper}
                                disabled={isLoadingPortal}
                                className="text-sm text-gray-500 hover:text-gray-300 underline disabled:opacity-50"
                            >
                                {isLoadingPortal ? 'Loading...' : 'Manage existing subscription'}
                            </button>
                        </div>
                     )}
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .plan-card {
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    height: 100%;
                }
                .plan-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2), 0 0 15px rgba(100, 100, 255, 0.1);
                }
                .plan-card ul {
                    flex-grow: 1;
                }
            `}} />
        </div>
    );
};

export default SubscriptionModal;