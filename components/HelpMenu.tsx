import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Card from './common/Card';
import { BrainCircuitIcon, SignatexLiteIcon, SignatexMaxIcon, SearchIcon, EyeIcon, BriefcaseIcon, DollarSignIcon, NewspaperIcon } from './common/Icons';

// Define the data structure for the menu
const aiFunctions = [
    {
        name: "Trade Flow Automation",
        model: "Lite",
        function: "getWorkflowFromPrompt (Planner/Actor)",
        description: "The AI interprets conversational commands (e.g., 'Buy 10 shares of AAPL') and executes them by navigating to the page and filling out the trade form.",
        linkPath: "/",
        elementId: 'ai-chat-open-button',
        action: 'open_chat'
    },
    {
        name: "Watchlist News Sentiment",
        model: "Lite",
        function: "analyzeNewsSentiment",
        description: "Analyzes the combined news headlines for all stocks in your active watchlist to generate a single BULLISH/BEARISH/NEUTRAL sentiment score and summary.",
        linkPath: "/",
        elementId: 'watchlist-news-button',
        action: 'click' // This remains 'click' because it opens a non-tab modal
    },
    {
        name: "Technical Chart Analysis",
        model: "Lite",
        function: "getTechnicalAnalysis",
        description: "Analyzes historical price data to identify the current trend, key support, and resistance levels for any selected stock.",
        linkPath: "/stock/:ticker",
        elementId: 'technical-analyze-button', // Corrected target to the button ID
        action: 'show_element' // CHANGED to show_element
    },
    {
        name: "Key Stock Metrics Summary",
        model: "Lite",
        function: "analyzeKeyMetrics",
        description: "Generates a plain-language summary of a stock's valuation and market data (P/E, Market Cap, Volume).",
        linkPath: "/stock/:ticker",
        elementId: 'summary-analyze-button',
        action: 'show_element' // CHANGED to show_element
    },
    {
        name: "Stock Picker Questionnaire",
        model: "Lite",
        function: "getStockPicks",
        description: "Recommends a list of stocks based on your chosen risk tolerance, investment strategy, and preferred sectors.",
        linkPath: "/picker",
        elementId: '',
        action: 'navigate'
    },
    {
        name: "Financial Statement Analysis",
        model: "Max",
        function: "analyzeFinancialStatements",
        description: "Performs a deep audit of the company's Income, Balance Sheet, and Cash Flow statements, detailing financial strengths and weaknesses.",
        linkPath: "/stock/:ticker",
        elementId: 'financials-analyze-button', // Corrected target to the button ID
        action: 'show_element' // CHANGED to show_element
    },
    {
        name: "Advanced Trading Strategy Recs",
        model: "Max",
        function: "getCombinedRecommendations",
        description: "Synthesizes market data, technical analysis, and analyst ratings into a single, actionable trading strategy (e.g., Buy Stock, Covered Call).",
        linkPath: "/stock/:ticker",
        elementId: 'advanced-tab-button', 
        action: 'show_element' // CHANGED to show_element (targets the tab itself, where content is)
    },
    {
        name: "Options Strategy Planner",
        model: "Max",
        function: "getOptionsStrategy",
        description: "Generates a specific, multi-leg options strategy (e.g., Bull Call Spread) based on a prompt and fetched options chain data.",
        linkPath: "/stock/:ticker",
        elementId: 'ai-chat-open-button',
        action: 'open_chat'
    },
    {
        name: "Trade Allocation Planner",
        model: "Max",
        function: "getTradeAllocation",
        description: "Allocates available cash across multiple watchlist stocks based on your risk profile and AI news sentiment analysis.",
        linkPath: "/",
        elementId: 'watchlist-news-button',
        action: 'click' // This remains 'click' because it opens a modal
    },
    {
        name: "Portfolio Risk Analysis",
        model: "Max",
        function: "analyzePortfolioRisk",
        description: "Calculates the portfolio's concentration risk by sector and provides suggestions for diversification.",
        linkPath: "/",
        elementId: 'risk-analysis-button',
        action: 'scroll_to'
    },
    {
        name: "Portfolio Recommendation",
        model: "Max",
        function: "getPortfolioRecommendation",
        description: "Generates a specific recommendation (Buy/Sell/Rebalance) for a ticker based on the overall portfolio context.",
        linkPath: "/stock/:ticker",
        elementId: 'ai-chat-open-button',
        action: 'open_chat'
    },
];

const getIcon = (name: string) => {
    switch(name) {
        case "Trade Flow Automation": return <BrainCircuitIcon className="h-6 w-6" />;
        case "Watchlist News Sentiment": return <NewspaperIcon className="h-6 w-6" />;
        case "Technical Chart Analysis": return <SearchIcon className="h-6 w-6" />;
        case "Key Stock Metrics Summary": return <DollarSignIcon className="h-6 w-6" />;
        case "Stock Picker Questionnaire": return <EyeIcon className="h-6 w-6" />;
        case "Financial Statement Analysis": return <BriefcaseIcon className="h-6 w-6" />;
        default: return <BrainCircuitIcon className="h-6 w-6" />;
    }
};

const HelpMenu: React.FC = () => {
    return (
        <div className="space-y-6">
            <Link to="/" className="text-brand-blue hover:underline">&larr; Back to Dashboard</Link>
            
            <Card>
                <div className="flex items-center gap-2 mb-4">
                    <BrainCircuitIcon className="h-8 w-8 text-brand-blue" />
                    <h1 className="text-3xl font-bold">AI Assistant Help Menu</h1>
                </div>
                <p className="text-night-200">
                    A comprehensive list of all Signatex AI capabilities and how they are categorized. 
                    <span className="font-bold">Lite</span> models are for quick tasks; <span className="font-bold">Max</span> models are for deep analysis and complex reasoning.
                </p>
                <p className="text-sm text-night-100 mt-4 p-3 bg-night-700 rounded-md border border-night-600">
                    <strong className="text-yellow-400">Note:</strong> AI analyses and recommendations (e.g., Financial Summary, Technical Analysis) are temporarily stored on your device for one week to preserve your work if you navigate away. After one week, they will be purged and must be regenerated.
                </p>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {aiFunctions.map((func, index) => (
                    <Card key={index} className="flex flex-col justify-between">
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    {getIcon(func.name)}
                                    <h3 className="text-xl font-bold">{func.name}</h3>
                                </div>
                                <span className={`flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    func.model === 'Lite' ? 'bg-blue-800/50 text-blue-400' : 'bg-yellow-800/50 text-yellow-400'
                                }`}>
                                    {func.model === 'Lite' ? <SignatexLiteIcon className="h-4 w-4 mr-1"/> : <SignatexMaxIcon className="h-4 w-4 mr-1"/>}
                                    {func.model}
                                </span>
                            </div>
                            <p className="text-night-100 text-sm">{func.description}</p>
                        </div>
                        
                        {func.action !== 'open_chat' && (
                            <Link 
                                to={func.linkPath.includes(':ticker') ? func.linkPath.replace(':ticker', 'AAPL') : func.linkPath}
                                className="mt-4 text-center text-sm font-bold bg-brand-blue text-white py-2 rounded-md hover:bg-blue-600 transition-colors"
                                onClick={() => {
                                    // For simplicity in a static menu, we'll rely on the target page logic 
                                    // for scrolling/opening tabs in the next step, but here's the nav.
                                    if (func.action === 'navigate' || func.action === 'scroll_to' || func.action === 'click' || func.action === 'open_tab') {
                                        // Store the intended action and target ID in localStorage before navigating
                                        localStorage.setItem('signatex_help_action', JSON.stringify({
                                            action: func.action,
                                            elementId: func.elementId,
                                        }));
                                    }
                                }}
                            >
                                {func.action === 'navigate' ? 'Go to Page' : 'See Where to Use'}
                            </Link>
                        )}
                        {func.action === 'open_chat' && (
                             <button
                                disabled
                                className="mt-4 text-center text-sm font-bold bg-night-600 text-night-400 py-2 rounded-md cursor-not-allowed"
                            >
                                Use in AI Assistant Chat
                            </button>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default HelpMenu;