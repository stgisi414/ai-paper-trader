import React, { useState, useEffect, useCallback } from 'react';
import * as fmpService from '../services/fmpService';
import * as geminiService from '../services/geminiService';
import type { FmpNews, AiAnalysis, TradeAllocationRecommendation, FmpQuote } from '../types';
import Spinner from './common/Spinner';
import { BrainCircuitIcon } from './common/Icons';
import { formatCurrency, formatPercentage } from '../utils/formatters';

interface WatchlistNewsProps {
    tickers: string[];
    onClose: () => void;
    cashOnHand: number;
}

const WatchlistNews: React.FC<WatchlistNewsProps> = ({ tickers, onClose, cashOnHand }) => {
    const [news, setNews] = useState<FmpNews[]>([]);
    const [quotes, setQuotes] = useState<FmpQuote[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [showAllocationForm, setShowAllocationForm] = useState(false);
    const [riskTolerance, setRiskTolerance] = useState('medium');
    const [investmentGoal, setInvestmentGoal] = useState('growth');
    const [amountToAllocate, setAmountToAllocate] = useState<number | string>(cashOnHand);
    const [isAllocating, setIsAllocating] = useState(false);
    const [allocationResult, setAllocationResult] = useState<TradeAllocationRecommendation | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            if (tickers.length === 0) {
                setIsLoading(false);
                return;
            }
            setIsLoading(true);
            try {
                const [allNews, allQuotes] = await Promise.all([
                    fmpService.getNews(tickers.join(','), 50),
                    fmpService.getQuote(tickers.join(','))
                ]);
                
                const sortedNews = allNews.sort((a, b) => new Date(b.publishedDate).getTime() - new Date(a.publishedDate).getTime());
                
                setNews(sortedNews);
                setQuotes(allQuotes);
            } catch (error) {
                console.error("Failed to fetch watchlist news and quotes:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, [tickers]);

    const handleAnalyzeNews = useCallback(async () => {
        if (news.length === 0) return;
        setIsAnalyzing(true);
        setAnalysis(null);
        try {
            const companyName = tickers.length > 1 ? `the companies in the watchlist (${tickers.join(', ')})` : tickers[0];
            const analysisResult = await geminiService.analyzeNewsSentiment(companyName, news);
            setAnalysis(analysisResult);
        } catch (error) {
            console.error("Watchlist news analysis failed:", error);
            alert("The AI news analysis could not be completed at this time.");
        } finally {
            setIsAnalyzing(false);
        }
    }, [news, tickers]);

    const handleGenerateAllocation = useCallback(async () => {
        if (!analysis) return;

        const numericAmount = Number(amountToAllocate);
        if (isNaN(numericAmount) || numericAmount <= 0) {
            alert("Please enter a valid amount to allocate.");
            return;
        }
        if (numericAmount > cashOnHand) {
            alert("Allocation amount cannot exceed your available cash.");
            return;
        }

        setIsAllocating(true);
        setAllocationResult(null);
        try {
            // FIX: Ensure all three parameters are passed to the service
            const result = await geminiService.getTradeAllocation(
                analysis,
                riskTolerance,
                investmentGoal,
                quotes,
                Number(amountToAllocate)
            );
            setAllocationResult(result);
        } catch (error) {
            console.error("Trade allocation failed:", error);
            alert("The AI trade allocation could not be completed.");
        } finally {
            setIsAllocating(false);
        }
    }, [analysis, riskTolerance, investmentGoal, quotes, cashOnHand, amountToAllocate]);

    return (
        <div className="fixed inset-0 bg-night-900 bg-opacity-80 flex justify-center items-center z-50 p-4">
            <div className="bg-night-800 rounded-lg shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b border-night-700 flex-shrink-0">
                    <h2 className="text-2xl font-bold">Watchlist News</h2>
                    <button 
                        onClick={onClose} 
                        className="p-2 rounded-full text-night-500 hover:bg-night-600 hover:text-white transition-colors"
                        aria-label="Close news"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                {/* FIX: This is the main scrolling container. Added `min-h-0` to constrain its height properly. */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                    {/* Top-level container for analysis and news list */}
                    <div>
                        <button
                            onClick={handleAnalyzeNews}
                            disabled={isAnalyzing || news.length === 0}
                            className="w-full bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600 flex items-center justify-center gap-2 mb-4"
                        >
                            <BrainCircuitIcon className="h-5 w-5" />
                            {isAnalyzing ? 'Analyzing...' : 'Analyze All News with AI'}
                        </button>

                        {isAnalyzing && <Spinner />}
                        {analysis && (
                            <div className="bg-night-700 p-4 rounded-lg mb-4">
                                <h3 className="text-lg font-bold">AI Sentiment Analysis: <span className="text-brand-blue">{analysis.sentiment}</span> (Confidence: {formatPercentage(analysis.confidenceScore * 100)})</h3>
                                <p className="mt-2 text-night-100 text-sm">{analysis.summary}</p>
                                
                                <div className="mt-4 border-t border-night-600 pt-4">
                                    {!showAllocationForm && (
                                        <button
                                            onClick={() => setShowAllocationForm(true)}
                                            className="w-full bg-brand-green text-white font-bold py-2 px-4 rounded-md hover:bg-green-700 transition-colors"
                                        >
                                            Generate Trade Allocation Recommendation
                                        </button>
                                    )}

                                    {showAllocationForm && (
                                        <div className="space-y-4">
                                            {/* FIX START: Restore the missing UI for risk and goal */}
                                            <div>
                                                <label className="block text-sm font-medium text-night-100 mb-2">What is your risk tolerance?</label>
                                                <div className="flex gap-2">
                                                    {['Low', 'Medium', 'High'].map(level => (
                                                        <button key={level} onClick={() => setRiskTolerance(level.toLowerCase())} className={`px-3 py-1 rounded-md text-sm ${riskTolerance === level.toLowerCase() ? 'bg-yellow-400 text-night-900' : 'bg-night-600 hover:bg-night-500'}`}>{level}</button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-night-100 mb-2">What is your investment goal?</label>
                                                 <div className="flex gap-2">
                                                    {['Growth', 'Income', 'Capital Preservation'].map(goal => (
                                                        <button key={goal} onClick={() => setInvestmentGoal(goal.replace(' ', '-').toLowerCase())} className={`px-3 py-1 rounded-md text-sm ${investmentGoal === goal.replace(' ', '-').toLowerCase() ? 'bg-yellow-400 text-night-900' : 'bg-night-600 hover:bg-night-500'}`}>{goal}</button>
                                                    ))}
                                                </div>
                                            </div>
                                            {/* FIX END */}
                                            
                                            <div>
                                                <label htmlFor="allocation-amount" className="block text-sm font-medium text-night-100 mb-2">
                                                    Amount to Allocate (Available: {formatCurrency(cashOnHand)})
                                                </label>
                                                <input
                                                    type="number"
                                                    id="allocation-amount"
                                                    value={amountToAllocate}
                                                    onChange={(e) => setAmountToAllocate(e.target.value)}
                                                    className="w-full bg-night-800 border border-night-600 rounded-md py-2 px-3 focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                                                    placeholder="Enter amount"
                                                />
                                            </div>
                                            
                                            <button
                                                onClick={handleGenerateAllocation}
                                                disabled={isAllocating}
                                                className="w-full bg-purple-600 text-white font-bold py-2 px-4 rounded-md hover:bg-purple-700 transition-colors disabled:bg-night-600"
                                            >
                                                {isAllocating ? 'Calculating...' : 'Get Allocation'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        
                        {isAllocating && <Spinner />}
                        {allocationResult && (
                             <div className="bg-night-700 p-4 rounded-lg mb-4">
                                <h3 className="text-lg font-bold text-green-400">AI Trade Allocation</h3>
                                <p className="mt-2 text-night-100 text-sm italic">"{allocationResult.reasoning}"</p>
                                <div className="mt-4 space-y-2">
                                    {allocationResult.allocations.map(alloc => (
                                        <div key={alloc.ticker} className="flex justify-between items-center bg-night-800 p-2 rounded">
                                            <span className="font-bold text-white">{alloc.ticker}</span>
                                            <div className="text-right">
                                                <span className="font-semibold text-green-400">{formatCurrency(alloc.amount)}</span>
                                                <span className="text-xs text-night-500 ml-2">({alloc.percentage}%)</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {isLoading ? (
                            <Spinner />
                        ) : news.length === 0 ? (
                            <p className="text-center text-night-500">No news available for the stocks in this watchlist.</p>
                        ) : (
                            news.map((article, index) => (
                                <a href={article.url} key={index} target="_blank" rel="noopener noreferrer" className="block bg-night-700 p-4 rounded-lg hover:bg-night-600 transition-colors">
                                    <div className="flex items-start gap-4">
                                        {article.image && <img src={article.image} alt={article.title} className="w-20 h-20 object-cover rounded-md"/>}
                                        <div>
                                            <h3 className="font-bold text-md">{article.title}</h3>
                                            <p className="text-xs text-night-500 mt-1">
                                                <span className="font-bold text-brand-blue">{article.symbol}</span> &bull; {new Date(article.publishedDate).toLocaleString()} &bull; {article.site}
                                            </p>
                                            <p className="text-sm text-night-100 mt-2 line-clamp-2">{article.text}</p>
                                        </div>
                                    </div>
                                </a>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WatchlistNews;