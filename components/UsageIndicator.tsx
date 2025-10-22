// components/UsageIndicator.tsx

import React from 'react';
import {
    useAuth,
    FREE_LITE_LIMIT, FREE_MAX_LIMIT,
    STARTER_LITE_LIMIT, STARTER_MAX_LIMIT,
    STANDARD_LITE_LIMIT, STANDARD_MAX_LIMIT,
    PRO_LITE_LIMIT, PRO_MAX_LIMIT, // ADDED: Import Pro limits
    STRIPE_STARTER_PRICE_ID_MONTHLY,
    STRIPE_STANDARD_PRICE_ID_MONTHLY,
    STRIPE_PRO_PRICE_ID_MONTHLY
} from '../src/hooks/useAuth';
import { SignatexLiteIcon, SignatexMaxIcon } from './common/Icons';

const UsageIndicator: React.FC = () => {
    // MODIFICATION: Destructure usageTier as well
    const { isPro, activePriceId, liteUsed, maxUsed, userSettings } = useAuth();
    const { usageTier } = userSettings; // Get custom tier

    let planName = "Free";
    let liteLimit = FREE_LITE_LIMIT;
    let maxLimit = FREE_MAX_LIMIT;
    let planColor = 'text-gray-400';

    // ADDITION: Handle custom unlimited tier display first
    if (usageTier === 'unlimited') {
        return (
            <div className={`text-center bg-night-900/50 p-3 rounded-lg border border-purple-500/50`}>
                <h4 className={`font-bold text-purple-400`}>ADMIN OVERRIDE</h4>
                <p className="text-xs text-night-300">You have unlimited AI usage (Custom Tier).</p>
            </div>
        );
    }

    // Determine plan details based on isPro and activePriceId (if no custom tier)
    if (isPro) {
        if (activePriceId === STRIPE_PRO_PRICE_ID_MONTHLY) {
            planName = "Pro";
            // MODIFIED: Use defined Pro limits
            liteLimit = PRO_LITE_LIMIT;
            maxLimit = PRO_MAX_LIMIT;
            planColor = 'text-yellow-400';
            // REMOVED: isUnlimited flag
        } else if (activePriceId === STRIPE_STANDARD_PRICE_ID_MONTHLY) {
            planName = "Standard";
            liteLimit = STANDARD_LITE_LIMIT;
            maxLimit = STANDARD_MAX_LIMIT;
            planColor = 'text-blue-400';
        } else if (activePriceId === STRIPE_STARTER_PRICE_ID_MONTHLY) {
            planName = "Starter";
            liteLimit = STARTER_LITE_LIMIT;
            maxLimit = STARTER_MAX_LIMIT;
            planColor = 'text-green-400';
        } else {
             planName = "Unknown Paid Plan";
             console.warn("User isPro but activePriceId doesn't match known paid plans:", activePriceId);
        }
    }
    // If not isPro, the default Free plan values remain.

    // REMOVED: The block that displayed "unlimited" for the Pro plan

    // Display for plans with limits (Free, Starter, Standard, Pro, or Unknown Paid)
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