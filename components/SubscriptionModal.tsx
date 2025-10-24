import React, { useState } from 'react';
import { createStripeCheckoutSession, redirectToStripeCustomerPortal } from '../services/stripeService';
import Spinner from './common/Spinner';
import { SignatexMaxIcon, SignatexLiteIcon } from './common/Icons';
// Import useAuth and the Price ID constants
import {
    useAuth,
    STRIPE_STARTER_PRICE_ID_MONTHLY,
    STRIPE_STANDARD_PRICE_ID_MONTHLY,
    STRIPE_PRO_PRICE_ID_MONTHLY
} from '../src/hooks/useAuth'; // Adjust path if needed

// --- Price IDs are now imported from useAuth ---

interface SubscriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    reason?: string; // Optional message explaining why the modal appeared
}

// Plan details (keep consistent with PricingPage and useAuth)
const plans = [
  {
    name: "Starter",
    price: "$35/mo",
    priceId: STRIPE_STARTER_PRICE_ID_MONTHLY, // Use imported constant
    features: ["5 Signatex Max usages", "50 Signatex Lite usages", "Full paper trading access"],
    borderColor: 'border-green-500' // Changed color for distinction
  },
  {
    name: "Standard",
    price: "$60/mo",
    priceId: STRIPE_STANDARD_PRICE_ID_MONTHLY, // Use imported constant
    features: ["40 Signatex Max usages", "500 Signatex Lite usages", "Full paper trading access"],
    borderColor: 'border-blue-500'
  },
  {
    name: "Pro",
    price: "$120/mo",
    priceId: STRIPE_PRO_PRICE_ID_MONTHLY,
    features: [
        `200 Signatex Max usages`,
        `1500 Signatex Lite usages`,
        "Full paper trading access",
        "Advanced charting tools",
        "Priority support"
    ],
    borderColor: 'border-yellow-500'
  },
];


const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ isOpen, onClose, reason }) => {
    // Get user, isPro, and activePriceId
    const { user, isPro, activePriceId } = useAuth();
    const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
    const [isLoadingPortal, setIsLoadingPortal] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // --- handleSubscribeWrapper and handleSubscribe remain the same ---
     const handleSubscribeWrapper = (priceId: string, planName: string) => (event: React.MouseEvent) => {
        handleSubscribe(priceId, planName);
    };

    const handleSubscribe = async (priceId: string, planName: string) => {
        console.log(`[SubscriptionModal DEBUG] handleSubscribe called for plan: ${planName}, priceId: ${priceId}`); // DEBUG
        if (!user) {
            console.error("[handleSubscribe] Error: User not logged in.");
            setError("You must be logged in to subscribe.");
            console.log("[SubscriptionModal DEBUG] No user found, returning."); // DEBUG
            return;
        }
        console.log(`[handleSubscribe] User ID: ${user.uid}`); // Log user ID
        setError(null);
        setIsLoading(prev => ({ ...prev, [priceId]: true }));

        try {
            console.log("[SubscriptionModal DEBUG] Calling createStripeCheckoutSession..."); // DEBUG
            // Pass success/cancel URLs pointing back to the app root or a specific confirmation page
            const successUrl = `${window.location.origin}${window.location.pathname}#/`; // Or a specific success path like '#/subscription-success'
            const cancelUrl = `${window.location.origin}${window.location.pathname}#/pricing`; // Back to pricing on cancel
            await createStripeCheckoutSession(priceId, successUrl, cancelUrl);
            console.log("[handleSubscribe] createStripeCheckoutSession finished (should redirect)."); // Log after call (might not be reached if redirect happens)
            // Redirect happens in stripeService if successful
        } catch (err) {
            // Keep existing error handling
            console.error(`[handleSubscribe] Checkout for ${planName} failed:`, err);
            const errorMessage = (err instanceof Error && err.message) ? err.message : "An unexpected error occurred during checkout.";
            setError(errorMessage);
            console.log("[SubscriptionModal DEBUG] Setting isLoading to false after error."); // DEBUG
            setIsLoading(prev => ({ ...prev, [priceId]: false }));
        }
    };

    // --- handleManageSubscriptionWrapper and handleManageSubscription remain the same ---
     const handleManageSubscriptionWrapper = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        handleManageSubscription();
     };

    const handleManageSubscription = async () => {
        setError(null);
        setIsLoadingPortal(true);
        try {
            await redirectToStripeCustomerPortal();
        } catch (err) {
            console.error("Failed to redirect to customer portal:", err);
            const errorMessage = (err instanceof Error && err.message) ? err.message : "Could not open the billing portal.";
            setError(errorMessage);
        } finally {
             setIsLoadingPortal(false);
        }
    };


    if (!isOpen) {
        return null;
    }

    // --- MODIFICATION: Determine current plan name based on activePriceId ---
    let currentPlanName = "Free";
    let currentPlanFeatures: string[] = ["30 Lite usages/month", "3 Max usages/month", "Basic paper trading"]; // Example free features
    let isPaidPlan = false; // Flag to check if any paid plan is active

    if (isPro && activePriceId) {
        isPaidPlan = true; // Set flag if isPro is true
        if (activePriceId === STRIPE_PRO_PRICE_ID_MONTHLY) {
            currentPlanName = "Pro";
            currentPlanFeatures = plans.find(p => p.name === "Pro")?.features || [];
        } else if (activePriceId === STRIPE_STANDARD_PRICE_ID_MONTHLY) {
            currentPlanName = "Standard";
            currentPlanFeatures = plans.find(p => p.name === "Standard")?.features || [];
        } else if (activePriceId === STRIPE_STARTER_PRICE_ID_MONTHLY) {
            currentPlanName = "Starter";
            currentPlanFeatures = plans.find(p => p.name === "Starter")?.features || [];
        } else {
            currentPlanName = "Unknown Paid Plan"; // Fallback
            currentPlanFeatures = ["Status: Active", "Contact support if needed."];
        }
    }
    // --- END MODIFICATION ---

    console.log("[SubscriptionModal Render] Error State:", error);
    console.log("[SubscriptionModal Render] Reason Prop:", reason);
    console.log("[SubscriptionModal Render] isPro:", isPro, "activePriceId:", activePriceId, "Calculated Plan:", currentPlanName); // Add logging

    return (
        <div className="fixed inset-0 bg-night-900 bg-opacity-80 flex justify-center items-center z-50 p-4 transition-opacity duration-300">
            <div className="bg-night-800 rounded-lg shadow-2xl w-full max-w-4xl relative animate-fade-in-up max-h-[95vh] overflow-y-auto p-4">
                {/* Close Button (no changes) */}
                 <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1 rounded-full text-night-500 hover:bg-night-600 hover:text-white transition-colors z-10"
                    aria-label="Close subscription modal"
                >
                    {/* SVG omitted for brevity */}
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>

                <div>
                    {/* --- MODIFICATION: Show correct title based on whether a paid plan is active --- */}
                    <h2 className="text-3xl font-bold text-center mb-2 text-yellow-400">
                        {isPaidPlan ? 'Manage Subscription' : 'Choose Your Plan'}
                    </h2>
                    {/* --- MODIFICATION: Show correct current plan name --- */}
                    <p className="text-center text-base text-night-400 mb-4">
                        Current Plan: <span className="font-semibold">{currentPlanName}</span>
                    </p>

                    {/* Show reason only if NOT on a paid plan */}
                    {reason && !isPaidPlan && (
                        <p className="text-center text-sm text-yellow-500 mb-4 bg-night-700 p-2 rounded">
                            {typeof reason === 'string' ? reason : 'Invalid reason type'}
                        </p>
                    )}

                    {/* Error display (no changes) */}
                    {error && typeof error === 'string' && (
                        <p className="text-center text-sm text-red-500 mb-4">{error}</p>
                    )}
                    {error && typeof error !== 'string' && (
                        console.error("[SubscriptionModal Render Error] 'error' state contained a non-string:", error)
                    )}

                    {/* --- MODIFICATION: Conditional rendering based on isPaidPlan --- */}
                    {isPaidPlan ? (
                        // User has an active Starter, Standard, or Pro plan
                        <div className="text-center mt-6">
                             {/* Display features of the current ACTIVE plan */}
                             <h3 className="text-xl font-semibold mb-3">Your {currentPlanName} Plan Features:</h3>
                             <ul className="list-disc list-inside space-y-1 text-sm text-night-200 mb-6 inline-block text-left">
                                {currentPlanFeatures.map((feature, index) => {
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
                             <br /> {/* Add line break */}
                            <button
                                onClick={handleManageSubscriptionWrapper}
                                disabled={isLoadingPortal}
                                className="w-full max-w-xs mx-auto bg-gray-600 text-white font-bold py-2 px-4 rounded-md hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {isLoadingPortal ? <Spinner /> : 'Manage Billing & Subscription'}
                            </button>
                        </div>
                    ) : (
                        // User is on the Free plan, show all paid options
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                            {plans.map((plan) => (
                                <div key={plan.name} className={`bg-night-700 p-4 rounded-lg shadow-lg border-t-4 ${plan.borderColor} flex flex-col justify-between`}>
                                    <div>
                                        <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                                        <p className="text-2xl font-extrabold text-blue-400 mb-3">{plan.price}</p>
                                        <ul className="list-disc list-inside space-y-2 text-sm text-night-200 mb-4 min-h-[10rem]">
                                             {plan.features.map((feature, index) => {
                                                  // Feature rendering with icons (no changes here)
                                                  // ... (same as before) ...
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
                                        onClick={handleSubscribeWrapper(plan.priceId, plan.name)}
                                        disabled={!!isLoading[plan.priceId]}
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
                    {/* --- END MODIFICATION --- */}

                     {/* Manage link (no changes needed here, logic handled above) */}
                     {user && !isPaidPlan && (
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

             {/* Style section (no changes needed here) */}
             {/* ... */}
              <style dangerouslySetInnerHTML={{ __html: `
                .plan-card { display: flex; flex-direction: column; justify-content: space-between; height: 100%; }
                .plan-card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0, 0, 0, 0.2), 0 0 15px rgba(100, 100, 255, 0.1); }
                .plan-card ul { flex-grow: 1; }
            `}} />
        </div>
    );
};

export default SubscriptionModal;