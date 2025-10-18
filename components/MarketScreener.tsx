import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { BrainCircuitIcon } from './common/Icons';
import * as geminiService from '../services/geminiService';
import type { AiScreener } from '../types';
import { SignatexMaxIcon } from './common/Icons';
import { useAuth } from '../src/hooks/useAuth'; // Import useAuth

interface ScreenerOption {
    id: string;
    prompt: string;
    title: string;
    icon: React.FC<{className?: string}>;
}

const screenerOptions: ScreenerOption[] = [
    { id: 'momentum', prompt: 'Find the top 5 large-cap stocks showing strong upward momentum based on short-term and medium-term price action.', title: 'Top Momentum Stocks', icon: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg> },
    { id: 'value', prompt: 'Identify 5 large-cap stocks that are significantly undervalued based on fundamental metrics (low P/E, high earnings growth potential).', title: 'Undervalued Gems', icon: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="10" width="18" height="12" rx="2"></rect><path d="M12 2v8"></path><path d="M12 10a5 5 0 0 1 5 5v5a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-5a5 5 0 0 1 5-5z"></path></svg> },
    { id: 'news', prompt: 'Identify 5 stocks with recent overwhelmingly positive news headlines but whose price has not yet fully reflected the news.', title: 'Positive Sentiment Movers', icon: ({ className }) => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm10-14h-4"></path><path d="M10 12h8"></path><path d="M10 16h8"></path></svg> },
];

const MarketScreener: React.FC = () => {
    const { checkUsage, logUsage, onLimitExceeded } = useAuth(); // Get auth functions
    const authFunctions = { checkUsage, logUsage, onLimitExceeded };

    const [activeScreen, setActiveScreen] = useState<string | null>(null);
    const [screenerResult, setScreenerResult] = useState<AiScreener | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const runScreen = useCallback(async (option: ScreenerOption) => {
        setActiveScreen(option.id);
        setIsLoading(true);
        setError(null);
        setScreenerResult(null);

        try {
            const result = await geminiService.getMarketScreenerPicks(option.prompt, authFunctions);
            setScreenerResult(result);
        } catch (err) {
            console.error(err);
            // Don't set a generic error if the modal was opened by onLimitExceeded
            if ((err as Error).message !== 'Usage limit exceeded') {
                setError("Failed to run AI screener. Please try again.");
            }
            setScreenerResult(null);
        } finally {
            setIsLoading(false);
        }
    }, [authFunctions]);

    return (
        <Card>
            <div className="flex items-center gap-2 mb-6">
                <BrainCircuitIcon className="h-6 w-6 text-yellow-400" />
                <h2 className="text-2xl font-bold text-yellow-400">AI Market Screener</h2>
                <SignatexMaxIcon
                    className="h-5 w-5 text-yellow-500 ml-1"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {screenerOptions.map((option) => (
                    <button
                        key={option.id}
                        onClick={() => runScreen(option)}
                        disabled={isLoading}
                        className={`p-4 rounded-lg text-left transition-colors flex flex-col items-start gap-2 h-full ${
                            activeScreen === option.id ? 'bg-yellow-400 text-night-900 shadow-xl' : 'bg-night-700 hover:bg-night-600'
                        }`}
                    >
                        <option.icon className={`w-6 h-6 ${activeScreen === option.id ? 'text-night-900' : 'text-brand-blue'}`} />
                        <span className="font-bold text-lg">{option.title}</span>
                        <p className={`text-sm ${activeScreen === option.id ? 'text-night-900' : 'text-night-500'}`}>{option.prompt.split('.')[0]}</p>
                    </button>
                ))}
            </div>

            {isLoading && <div className="text-center p-4"><Spinner /></div>}
            {error && <div className="text-center text-brand-red p-4">{error}</div>}

            {screenerResult && (
                <div className="mt-4 border-t border-night-700 pt-6">
                    <h3 className="text-xl font-bold mb-2">{screenerResult.title}</h3>
                    <p className="text-night-500 mb-4">{screenerResult.description}</p>
                    
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b border-night-600">
                                <tr>
                                    <th className="p-3">Score</th>
                                    <th className="p-3">Ticker</th>
                                    <th className="p-3">Company</th>
                                    <th className="p-3">AI Rationale</th>
                                </tr>
                            </thead>
                            <tbody>
                                {screenerResult.picks.map((pick, index) => (
                                    <tr key={pick.symbol} className="border-b border-night-700 hover:bg-night-700">
                                        {/* FIX 1: Ensure Score is accessed and rendered */}
                                        <td className="p-3 font-bold text-yellow-400">{pick.score}</td> 
                                        
                                        {/* FIX 2: Ensure Ticker (symbol) is rendered */}
                                        <td className="p-3 font-bold">
                                            <Link to={`/stock/${pick.symbol}`} className="text-brand-blue hover:underline">{pick.symbol}</Link>
                                        </td>
                                        
                                        {/* Company is already correct */}
                                        <td className="p-3">{pick.name}</td>
                                        
                                        {/* FIX 3: Ensure AI Rationale (reason) is rendered */}
                                        <td className="p-3 text-sm text-night-100">{pick.reason}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </Card>
    );
};

export default MarketScreener;