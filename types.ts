export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  purchasePrice: number;
  currentPrice: number;
}

// NEW: Represents a held options contract in the portfolio
export interface OptionHolding {
  symbol: string; // The specific option symbol, e.g., AAPL241220C00150000
  underlyingTicker: string;
  shares: number; // Number of contracts
  purchasePrice: number; // Price per share (premium)
  currentPrice: number;
  optionType: 'call' | 'put';
  strikePrice: number;
  expirationDate: string;
}

export interface Portfolio {
  cash: number;
  holdings: Holding[];
  optionHoldings: OptionHolding[]; // Added to track options
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

// NEW: Represents a single options contract from the FMP API
export interface FmpOptionContract {
    symbol: string;
    date: string;
    expirationDate: string;
    optionType: 'call' | 'put';
    strike: number;
    lastPrice: number;
    bid: number;
    ask: number;
    change: number;
    percentChange: number;
    volume: number;
    openInterest: number;
    impliedVolatility: number;
}

// NEW: Represents the entire option chain payload from FMP
export interface FmpOptionChain {
    symbol: string;
    stockPrice: number;
    options: FmpOptionContract[];
}

// NEW: Represents the options position summary from FMP
export interface FmpOptionsPositionSummary {
    symbol: string;
    date: string;
    totalCalls: number;
    totalPuts: number;
    putCallRatio: number;
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