import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import * as fmpService from '../services/fmpService';
import * as geminiService from '../services/geminiService';
import type { FmpQuote, FmpProfile, FmpHistoricalData, FmpNews, AiAnalysis } from '../types';
import { usePortfolio } from '../hooks/usePortfolio';
import Card from './common/Card';
import Spinner from './common/Spinner';
import { formatCurrency, formatNumber, formatPercentage } from '../utils/formatters';
import { BrainCircuitIcon } from './common/Icons';

const StockView: React.FC = () => {
    const { ticker } = useParams<{ ticker: string }>();
    const { buyStock, sellStock, portfolio } = usePortfolio();

    const [quote, setQuote] = useState<FmpQuote | null>(null);
    const [profile, setProfile] = useState<FmpProfile | null>(null);
    const [historicalData, setHistoricalData] = useState<FmpHistoricalData[]>([]);
    const [news, setNews] = useState<FmpNews[]>([]);
    const [aiAnalysis, setAiAnalysis] = useState<AiAnalysis | null>(null);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [tradeShares, setTradeShares] = useState(1);

    useEffect(() => {
        if (!ticker) return;
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [quoteData, profileData, historyData, newsData] = await Promise.all([
                    fmpService.getQuote(ticker),
                    fmpService.getProfile(ticker),
                    fmpService.getHistoricalData(ticker),
                    fmpService.getNews(ticker, 10),
                ]);
                setQuote(quoteData[0] || null);
                setProfile(profileData[0] || null);
                setHistoricalData(historyData.historical.reverse());
                setNews(newsData);
            } catch (error) {
                console.error("Failed to fetch stock data:", error);
                alert('Failed to load stock data. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [ticker]);

    const handleAiAnalysis = useCallback(async () => {
        if (!profile || news.length === 0) return;
        setIsAiLoading(true);
        setAiAnalysis(null);
        try {
            const analysis = await geminiService.analyzeNewsSentiment(profile.companyName, news);
            setAiAnalysis(analysis);
        } catch (error) {
            console.error("AI Analysis failed:", error);
            alert("The AI analysis could not be completed.");
        } finally {
            setIsAiLoading(false);
        }
    }, [profile, news]);

    const handleBuy = () => {
        if (quote && profile && tradeShares > 0) {
            buyStock(quote.symbol, profile.companyName, tradeShares, quote.price);
            alert(`Successfully bought ${tradeShares} share(s) of ${quote.symbol}`);
        }
    };
    
    const handleSell = () => {
        if (quote && tradeShares > 0) {
            sellStock(quote.symbol, tradeShares, quote.price);
            alert(`Successfully sold ${tradeShares} share(s) of ${quote.symbol}`);
        }
    };

    const sharesOwned = portfolio.holdings.find(h => h.ticker === ticker)?.shares || 0;

    if (isLoading) {
        return <div className="flex justify-center items-center h-screen"><Spinner /></div>;
    }

    if (!quote || !profile) {
        return <div className="text-center text-red-500 mt-10">Stock data not found for {ticker}.</div>;
    }

    const priceChangeColor = quote.change >= 0 ? 'text-brand-green' : 'text-brand-red';

    return (
        <div className="space-y-6">
            <Link to="/" className="text-brand-blue hover:underline">&larr; Back to Dashboard</Link>
            
            <Card>
                <div className="flex items-center gap-4">
                    <img src={profile.image} alt={profile.companyName} className="h-16 w-16 rounded-full"/>
                    <div>
                        <h1 className="text-3xl font-bold">{profile.companyName} ({profile.symbol})</h1>
                        <p className="text-night-500">{quote.exchange}</p>
                    </div>
                </div>
                <div className="mt-4 flex items-baseline gap-4">
                    <span className="text-5xl font-bold">{formatCurrency(quote.price)}</span>
                    <span className={`text-2xl font-semibold ${priceChangeColor}`}>
                        {quote.change >= 0 ? '+' : ''}{formatCurrency(quote.change)} ({formatPercentage(quote.changesPercentage)})
                    </span>
                </div>
            </Card>

            <Card>
                <h2 className="text-xl font-bold mb-4">Price Chart (1Y)</h2>
                <ResponsiveContainer width="100%" height={400}>
                    <AreaChart data={historicalData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <defs>
                            <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#1a73e8" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="#1a73e8" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                        <XAxis dataKey="date" tick={{ fill: '#d0d0d0' }} />
                        <YAxis tickFormatter={(value) => formatCurrency(Number(value))} domain={['dataMin', 'dataMax']} tick={{ fill: '#d0d0d0' }} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#2a2a2a', border: '1px solid #3c3c3c' }}
                            labelStyle={{ color: '#d0d0d0' }}
                            formatter={(value) => [formatCurrency(Number(value)), 'Price']}
                        />
                        <Area type="monotone" dataKey="close" stroke="#1a73e8" fillOpacity={1} fill="url(#colorUv)" />
                    </AreaChart>
                </ResponsiveContainer>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1">
                    <h2 className="text-xl font-bold mb-4">Trade</h2>
                     <div className="space-y-4">
                        <div className="text-sm">Shares Owned: <span className="font-bold">{sharesOwned}</span></div>
                        <div className="text-sm">Cash Available: <span className="font-bold">{formatCurrency(portfolio.cash)}</span></div>
                        <div>
                            <label htmlFor="shares" className="block text-sm font-medium text-night-100 mb-1">Shares</label>
                            <input
                                type="number"
                                id="shares"
                                value={tradeShares}
                                onChange={(e) => setTradeShares(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-full bg-night-700 border border-night-600 rounded-md py-2 px-3 focus:ring-2 focus:ring-brand-blue focus:outline-none"
                                min="1"
                            />
                        </div>
                        <div className="text-center font-bold">Total: {formatCurrency(tradeShares * quote.price)}</div>
                        <div className="flex gap-4">
                            <button onClick={handleBuy} className="w-full bg-brand-green text-white font-bold py-2 px-4 rounded-md hover:bg-green-600 transition-colors">Buy</button>
                            <button onClick={handleSell} disabled={sharesOwned === 0} className="w-full bg-brand-red text-white font-bold py-2 px-4 rounded-md hover:bg-red-600 transition-colors disabled:bg-night-600">Sell</button>
                        </div>
                    </div>
                </Card>

                <Card className="lg:col-span-2">
                     <h2 className="text-xl font-bold mb-4">Key Statistics</h2>
                     <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                        <div><span className="text-night-500">Market Cap:</span> {formatNumber(quote.marketCap)}</div>
                        <div><span className="text-night-500">Volume:</span> {formatNumber(quote.volume)}</div>
                        <div><span className="text-night-500">Avg Volume:</span> {formatNumber(quote.avgVolume)}</div>
                        <div><span className="text-night-500">Day High:</span> {formatCurrency(quote.dayHigh)}</div>
                        <div><span className="text-night-500">Day Low:</span> {formatCurrency(quote.dayLow)}</div>
                        <div><span className="text-night-500">52-Wk High:</span> {formatCurrency(quote.yearHigh)}</div>
                        <div><span className="text-night-500">52-Wk Low:</span> {formatCurrency(quote.yearLow)}</div>
                        <div><span className="text-night-500">P/E Ratio:</span> {quote.pe ? quote.pe.toFixed(2) : 'N/A'}</div>
                        <div><span className="text-night-500">EPS:</span> {quote.eps ? formatCurrency(quote.eps) : 'N/A'}</div>
                    </div>
                </Card>
            </div>
            
            <Card>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold flex items-center gap-2"><BrainCircuitIcon className="h-6 w-6 text-brand-blue" /> AI News Analysis</h2>
                    <button onClick={handleAiAnalysis} disabled={isAiLoading} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:bg-night-600">
                        {isAiLoading ? 'Analyzing...' : 'Run Analysis'}
                    </button>
                </div>
                {isAiLoading && <Spinner />}
                {aiAnalysis && (
                    <div className={`bg-night-700 p-4 rounded-lg border-l-4 ${
                        aiAnalysis.sentiment === 'BULLISH' ? 'border-brand-green' :
                        aiAnalysis.sentiment === 'BEARISH' ? 'border-brand-red' : 'border-night-500'
                    }`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-bold">Sentiment: <span className={
                                    aiAnalysis.sentiment === 'BULLISH' ? 'text-brand-green' :
                                    aiAnalysis.sentiment === 'BEARISH' ? 'text-brand-red' : 'text-night-100'
                                }>{aiAnalysis.sentiment}</span></h3>
                                <p className="text-night-500">Confidence: {formatPercentage(aiAnalysis.confidenceScore * 100)}</p>
                            </div>
                        </div>
                        <p className="mt-2 text-night-100">{aiAnalysis.summary}</p>
                    </div>
                )}
                 <h3 className="text-lg font-bold mt-6 mb-2">Recent News</h3>
                <ul className="space-y-2 text-sm">
                    {news.map((item, index) => (
                        <li key={index} className="border-b border-night-700 pb-2">
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline">{item.title}</a>
                            <span className="text-night-500 ml-2">({item.site})</span>
                        </li>
                    ))}
                </ul>
            </Card>

        </div>
    );
};

export default StockView;