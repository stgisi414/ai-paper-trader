import React from 'react';
// Import necessary things from useAuth
import {
    useAuth,
    FREE_LITE_LIMIT, FREE_MAX_LIMIT,
    STARTER_LITE_LIMIT, STARTER_MAX_LIMIT,
    STANDARD_LITE_LIMIT, STANDARD_MAX_LIMIT,
    STRIPE_STARTER_PRICE_ID_MONTHLY,
    STRIPE_STANDARD_PRICE_ID_MONTHLY,
    STRIPE_PRO_PRICE_ID_MONTHLY
} from '../src/hooks/useAuth'; // Adjusted path assuming UsageIndicator is in components/
import { SignatexLiteIcon, SignatexMaxIcon } from './common/Icons';
// usePortfolio might not be needed here anymore unless you display portfolio info
// import { usePortfolio } from '../hooks/usePortfolio'; // Check if still needed


/**
 * A component that displays the user's current AI usage
 * against their monthly limits based on their active plan.
 */
const UsageIndicator: React.FC = () => {
    // Get isPro, activePriceId, liteUsed, maxUsed from useAuth
    const { isPro, activePriceId, liteUsed, maxUsed } = useAuth();

    let planName = "Free";
    let liteLimit = FREE_LITE_LIMIT;
    let maxLimit = FREE_MAX_LIMIT;
    let isUnlimited = false;
    let planColor = 'text-gray-400'; // Default color for Free

    // Determine plan details based on isPro and activePriceId
    if (isPro) {
        if (activePriceId === STRIPE_PRO_PRICE_ID_MONTHLY) {
            planName = "Pro";
            isUnlimited = true;
            planColor = 'text-yellow-400';
        } else if (activePriceId === STRIPE_STANDARD_PRICE_ID_MONTHLY) {
            planName = "Standard";
            liteLimit = STANDARD_LITE_LIMIT;
            maxLimit = STANDARD_MAX_LIMIT;
            planColor = 'text-blue-400'; // Example color for Standard
        } else if (activePriceId === STRIPE_STARTER_PRICE_ID_MONTHLY) {
            planName = "Starter";
            liteLimit = STARTER_LITE_LIMIT;
            maxLimit = STARTER_MAX_LIMIT;
            planColor = 'text-green-400'; // Example color for Starter
        } else {
             // If isPro is true but price ID doesn't match known paid plans,
             // it might be an old/invalid state or a new plan not yet coded.
             // Default to showing free limits but indicate potential issue.
             planName = "Unknown Paid Plan";
             console.warn("User isPro but activePriceId doesn't match known paid plans:", activePriceId);
        }
    }
    // If not isPro, the default Free plan values remain.

    if (isUnlimited) {
        return (
            <div className={`text-center bg-night-900/50 p-3 rounded-lg border border-yellow-500/50`}>
                <h4 className={`font-bold ${planColor}`}>PRO PLAN ACTIVE</h4>
                <p className="text-xs text-night-300">You have unlimited AI usage.</p>
            </div>
        );
    }

    // Display for plans with limits (Free, Starter, Standard, or Unknown Paid)
    return (
        <div className={`bg-night-700 p-3 rounded-lg border border-night-600`}>
            <h4 className={`font-bold ${planColor} mb-2 text-sm`}>{planName} Plan - Monthly AI Usage</h4>
            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-blue-400">
                        <SignatexLiteIcon className="h-4 w-4" />
                        <span>Signatex Lite</span>
                    </div>
                    {/* Display usage against the determined limit */}
                    <span className="font-mono text-night-200">{liteUsed} / {liteLimit}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-yellow-500">
                        <SignatexMaxIcon className="h-4 w-4" />
                        <span>Signatex Max</span>
                    </div>
                     {/* Display usage against the determined limit */}
                    <span className="font-mono text-night-200">{maxUsed} / {maxLimit}</span>
                </div>
            </div>
        </div>
    );
};

export default UsageIndicator;