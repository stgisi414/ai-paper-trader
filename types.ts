
export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  purchasePrice: number;
  currentPrice: number;
}

export interface Portfolio {
  cash: number;
  holdings: Holding[];
  initialValue: number;
}

export interface FmpQuote {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  volume: number;
  avgVolume: number;
  exchange: string;
  open: number;
  previousClose: number;
  eps: number;
  pe: number;
}

export interface FmpProfile {
    symbol: string;
    companyName: string;
    currency: string;
    image: string;
    description: string;
    sector: string;
    industry: string;
}

export interface FmpSearchResult {
    symbol: string;
    name: string;
    currency: string;
    stockExchange: string;
    exchangeShortName: string;
}

export interface FmpHistoricalData {
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface FmpNews {
    symbol: string;
    publishedDate: string;
    title: string;
    image: string;
    site: string;
    text: string;
    url: string;
}

export interface AiAnalysis {
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidenceScore: number;
  summary: string;
}

export interface StockPick extends FmpSearchResult {
  reason: string;
}

export interface QuestionnaireAnswers {
  risk: 'low' | 'medium' | 'high';
  strategy: 'growth' | 'value' | 'dividends' | 'undervalued';
  sectors: string[];
}