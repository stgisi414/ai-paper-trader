import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import * as geminiService from '../services/geminiService';
import * as fmpService from '../services/fmpService';
import type { QuestionnaireAnswers, StockPick } from '../types';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { BrainCircuitIcon } from './common/Icons';
import { useAuth } from '../src/hooks/useAuth';
import { SignatexMaxIcon, SignatexLiteIcon } from './common/Icons';

const sectors = ["Technology", "Healthcare", "Financial Services", "Consumer Cyclical", "Industrials", "Energy", "Real Estate", "Utilities"];

const StockPicker: React.FC = () => {
    const { checkUsage, logUsage, onLimitExceeded } = useAuth();
    const authFunctions = { checkUsage, logUsage, onLimitExceeded };

    const [answers, setAnswers] = useState<QuestionnaireAnswers>({
        risk: 'medium',
        strategy: 'growth',
        sectors: [],
        stockCount: 'few',
    });
    const [stockPicks, setStockPicks] = useState<StockPick[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleAnswerChange = (field: keyof QuestionnaireAnswers, value: any) => {
        setAnswers(prev => ({ ...prev, [field]: value }));
    };

    const handleSectorChange = (sector: string) => {
        setAnswers(prev => {
            const newSectors = prev.sectors.includes(sector)
                ? prev.sectors.filter(s => s !== sector)
                : [...prev.sectors, sector];
            return { ...prev, sectors: newSectors };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        setStockPicks([]);

        try {
            const picks = await geminiService.getStockPicks(answers, authFunctions);
            
            if (picks.stocks.length > 0) {
                const symbols = picks.stocks.map(p => p.symbol).join(',');
                const quotes = await fmpService.getQuote(symbols);

                const detailedPicks = picks.stocks.map(pick => {
                    const quote = quotes.find(q => q.symbol === pick.symbol);
                    return {
                        ...pick,
                        name: quote?.name || 'N/A',
                        stockExchange: quote?.exchange || 'N/A',
                        currency: 'USD'
                    };
                });
                setStockPicks(detailedPicks);
            } else {
                 setError("The AI could not provide recommendations for the selected criteria. Please try different options.");
            }
        } catch (err) {
            console.error(err);
            if ((err as Error).message !== 'Usage limit exceeded') {
                setError("An error occurred while getting stock picks. Please try again.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Link to="/" className="text-brand-blue hover:underline">&larr; Back to Dashboard</Link>
            
            <Card>
                <div className="flex items-center gap-2 mb-4">
                    <BrainCircuitIcon className="h-8 w-8 text-brand-blue" />
                    <h1 className="text-3xl font-bold">AI Stock Picker</h1>
                </div>
                <p className="text-night-500">Answer a few questions to get personalized stock recommendations from our AI.</p>
            </Card>

            <Card>
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Risk Tolerance */}
                    <div>
                        <label className="block text-lg font-bold mb-2">1. What is your risk tolerance?</label>
                        <div className="flex gap-4">
                            {(['low', 'medium', 'high'] as const).map(risk => (
                                <button type="button" key={risk} onClick={() => handleAnswerChange('risk', risk)}
                                    className={`px-4 py-2 rounded-md transition-colors ${answers.risk === risk ? 'bg-brand-blue text-white' : 'bg-night-700 hover:bg-night-600'}`}>
                                    {risk.charAt(0).toUpperCase() + risk.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Investment Strategy */}
                    <div>
                        <label className="block text-lg font-bold mb-2">2. What is your investment strategy?</label>
                        <div className="flex gap-4">
                            {(['growth', 'value', 'dividends', 'undervalued'] as const).map(strategy => (
                                <button type="button" key={strategy} onClick={() => handleAnswerChange('strategy', strategy)}
                                    className={`px-4 py-2 rounded-md transition-colors ${answers.strategy === strategy ? 'bg-brand-blue text-white' : 'bg-night-700 hover:bg-night-600'}`}>
                                    {strategy.charAt(0).toUpperCase() + strategy.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Number of Stocks */}
                    <div>
                        <label className="block text-lg font-bold mb-2">3. How many stock picks would you like?</label>
                        <div className="flex gap-4">
                            {(['few', 'several', 'many'] as const).map(count => (
                                <button type="button" key={count} onClick={() => handleAnswerChange('stockCount', count)}
                                    className={`px-4 py-2 rounded-md transition-colors ${answers.stockCount === count ? 'bg-brand-blue text-white' : 'bg-night-700 hover:bg-night-600'}`}>
                                    {count.charAt(0).toUpperCase() + count.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Preferred Sectors */}
                    <div>
                        <label className="block text-lg font-bold mb-2">4. Any preferred sectors? (Optional)</label>
                        <div className="flex flex-wrap gap-3">
                            {sectors.map(sector => (
                                <button type="button" key={sector} onClick={() => handleSectorChange(sector)}
                                    className={`px-4 py-2 rounded-full text-sm transition-colors ${answers.sectors.includes(sector) ? 'bg-brand-blue text-white' : 'bg-night-700 hover:bg-night-600'}`}>
                                    {sector}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="text-center">
                        <button type="submit" disabled={isLoading} className="bg-brand-green text-white font-bold py-3 px-8 rounded-md hover:bg-green-600 transition-colors disabled:bg-night-600">
                            <SignatexLiteIcon className="h-5 w-5 inline mr-1 mb-1" />
                            {isLoading ? 'Thinking...' : 'Get My Picks'}
                        </button>
                    </div>
                </form>
            </Card>

            {isLoading && <div className="text-center"><Spinner /></div>}
            {error && <div className="text-center text-red-500">{error}</div>}

            {stockPicks.length > 0 && (
                <Card>
                    <h2 className="text-2xl font-bold mb-4">Your AI-Generated Stock Picks</h2>
                    <div className="space-y-4">
                        {stockPicks.map(pick => (
                            <div key={pick.symbol} className="bg-night-700 p-4 rounded-lg">
                                <div className="flex justify-between items-center">
                                    <Link to={`/stock/${pick.symbol}`} className="text-xl font-bold text-brand-blue hover:underline">{pick.symbol}</Link>
                                    <span className="text-sm text-night-500">{pick.name}</span>
                                </div>
                                <p className="mt-2 text-night-100">{pick.reason}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
    );
};

export default StockPicker;