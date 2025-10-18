import React from 'react';
import { useAuth } from '../../src/hooks/useAuth';
import { SignatexLiteIcon, SignatexMaxIcon } from './Icons';
import { LITE_LIMIT, MAX_LIMIT } from '../../src/hooks/useAuth';

/**
 * A component that displays the user's current AI usage
 * against their monthly limits, or an "Unlimited" status for Pro users.
 */
const UsageIndicator: React.FC = () => {
    const { isPro, liteUsed, maxUsed } = useAuth();

    if (isPro) {
        return (
            <div className="text-center bg-night-900/50 p-3 rounded-lg border border-yellow-500/50">
                <h4 className="font-bold text-yellow-400">PRO PLAN ACTIVE</h4>
                <p className="text-xs text-night-300">You have unlimited AI usage.</p>
            </div>
        );
    }

    return (
        <div className="bg-night-700 p-3 rounded-lg border border-night-600">
            <h4 className="font-bold text-night-100 mb-2 text-sm">Monthly AI Usage</h4>
            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-blue-400">
                        <SignatexLiteIcon className="h-4 w-4" />
                        <span>Signatex Lite</span>
                    </div>
                    <span className="font-mono text-night-200">{liteUsed} / {LITE_LIMIT}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-yellow-500">
                        <SignatexMaxIcon className="h-4 w-4" />
                        <span>Signatex Max</span>
                    </div>
                    <span className="font-mono text-night-200">{maxUsed} / {MAX_LIMIT}</span>
                </div>
            </div>
        </div>
    );
};

export default UsageIndicator;
