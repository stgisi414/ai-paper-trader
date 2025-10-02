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
  optionHoldings: OptionHolding[];
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
  stockCount: 'few' | 'several' | 'many';
}

export interface FmpAnalystRating {
    symbol: string;
    date: string;
    analystRatingsBuy: number;
    analystRatingsHold: number;
    analystRatingsSell: number;
    analystRatingsStrongBuy: number;
    analystRatingsStrongSell: number;
}

export interface FmpPriceTarget {
    symbol: string;
    pubDate: string;
    analystName: string;
    priceTarget: number;
}

export interface FmpIncomeStatement {
    date: string;
    symbol: string;
    reportedCurrency: string;
    revenue: number;
    costOfRevenue: number;
    grossProfit: number;
    grossProfitRatio: number;
    researchAndDevelopmentExpenses: number;
    generalAndAdministrativeExpenses: number;
    sellingAndMarketingExpenses: number;
    sellingGeneralAndAdministrativeExpenses: number;
    otherExpenses: number;
    operatingExpenses: number;
    costAndExpenses: number;
    interestIncome: number;
    interestExpense: number;
    depreciationAndAmortization: number;
    ebitda: number;
    ebitdaratio: number;
    operatingIncome: number;
    operatingIncomeRatio: number;
    totalOtherIncomeExpensesNet: number;
    incomeBeforeTax: number;
    incomeBeforeTaxRatio: number;
    incomeTaxExpense: number;
    netIncome: number;
    netIncomeRatio: number;
    eps: number;
    epsdiluted: number;
    weightedAverageShsOut: number;
    weightedAverageShsOutDil: number;
    link: string;
    finalLink: string;
}

export interface FmpBalanceSheet {
    date: string;
    symbol: string;
    reportedCurrency: string;
    cashAndCashEquivalents: number;
    shortTermInvestments: number;
    cashAndShortTermInvestments: number;
    netReceivables: number;
    inventory: number;
    otherCurrentAssets: number;
    totalCurrentAssets: number;
    propertyPlantEquipmentNet: number;
    goodwill: number;
    intangibleAssets: number;
    goodwillAndIntangibleAssets: number;
    longTermInvestments: number;
    taxAssets: number;
    otherNonCurrentAssets: number;
    totalNonCurrentAssets: number;
    otherAssets: number;
    totalAssets: number;
    accountPayables: number;
    shortTermDebt: number;
    taxPayables: number;
    deferredRevenue: number;
    otherCurrentLiabilities: number;
    totalCurrentLiabilities: number;
    longTermDebt: number;
    deferredRevenueNonCurrent: number;
    deferredTaxLiabilitiesNonCurrent: number;
    otherNonCurrentLiabilities: number;
    totalNonCurrentLiabilities: number;
    otherLiabilities: number;
    capitalLeaseObligations: number;
    totalLiabilities: number;
    preferredStock: number;
    commonStock: number;
    retainedEarnings: number;
    accumulatedOtherComprehensiveIncomeLoss: number;
    othertotalStockholdersEquity: number;
    totalStockholdersEquity: number;
    totalLiabilitiesAndStockholdersEquity: number;
    minorityInterest: number;
    totalEquity: number;
    totalLiabilitiesAndTotalEquity: number;
    totalInvestments: number;
    totalDebt: number;
    netDebt: number;
    link: string;
    finalLink: string;
}

export interface FmpCashFlowStatement {
    date: string;
    symbol: string;
    reportedCurrency: string;
    netIncome: number;
    depreciationAndAmortization: number;
    deferredIncomeTax: number;
    stockBasedCompensation: number;
    changeInWorkingCapital: number;
    accountsReceivables: number;
    inventory: number;
    accountsPayables: number;
    otherWorkingCapital: number;
    otherNonCashItems: number;
    netCashProvidedByOperatingActivities: number;
    investmentsInPropertyPlantAndEquipment: number;
    acquisitionsNet: number;
    purchasesOfInvestments: number;
    salesMaturitiesOfInvestments: number;
    otherInvestingActivites: number;
    netCashUsedForInvestingActivites: number;
    debtRepayment: number;
    commonStockIssued: number;
    commonStockRepurchased: number;
    dividendsPaid: number;
    otherFinancingActivites: number;
    netCashUsedProvidedByFinancingActivities: number;
    effectOfForexChangesOnCash: number;
    netChangeInCash: number;
    cashAtEndOfPeriod: number;
    cashAtBeginningOfPeriod: number;
    operatingCashFlow: number;
    capitalExpenditure: number;
    freeCashFlow: number;
    link: string;
    finalLink: string;
}

export interface FmpInsiderTrading {
    symbol: string;
    filingDate: string;
    transactionDate: string;
    reportingCik: string;
    transactionType: string;
    securitiesOwned: number;
    companyCik: string;
    reportingName: string;
    typeOfOwner: string;
    acquistionOrDisposition: 'A' | 'D' | ''; // Can be an empty string
    formType: string;
    securitiesTransacted: number;
    price: number;
    securityName: string;
    link: string;
}

export interface FinancialStatementAnalysis {
    strengths: string[];
    weaknesses: string[];
    summary: string;
}

export interface TechnicalAnalysis {
    trend: 'Uptrend' | 'Downtrend' | 'Sideways';
    support: number;
    resistance: number;
    summary: string;
}

export interface PortfolioRiskAnalysis {
    riskLevel: 'Low' | 'Medium' | 'High';
    concentration: {
        highestSector: string;
        percentage: number;
    };
    suggestions: string[];
}

export interface KeyMetricsAnalysis {
    summary: string;
}

export interface CombinedRec {
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: 'High' | 'Medium' | 'Low';
    strategy: string;
    justification: string;
}

export interface AlpacaOptionContract {
    symbol: string;
    name: string;
    status: string;
    tradable: boolean;
    id: string;
    asset_class: string;
    exchange: string;
    style: string;
    type: 'call' | 'put';
    expiration_date: string;
    strike_price: string; // Is a string in the API response
    underlying_symbol: string;
    close_price: number | null; // Use close_price instead of last_trade
    volume: number | null;
    open_interest: number | null;
    delta: number | null;
    gamma: number | null;
    theta: number | null;
    vega: number | null;
    impliedVolatility: number | null;
}

export interface AlpacaOptionsResponse {
    option_contracts: AlpacaOptionContract[]; // FIX: Changed from "options"
    next_page_token: string | null;
}

// Add OptionHolding and update Portfolio
export interface OptionHolding {
  symbol: string; // The specific option symbol, e.g., AAPL241220C00150000
  underlyingTicker: string;
  shares: number; // Number of contracts
  purchasePrice: number; // Price per share (premium)
  currentPrice: number;
  optionType: 'call' | 'put';
  strikePrice: number;
  expirationDate: string;
  // ADDED volume/open interest, KEPT greeks for consistency
  volume: number | null; 
  open_interest: number | null; 
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  impliedVolatility: number | null;
}

export interface AlpacaOptionBar {
    t: string; // Timestamp
    o: number; // Open
    h: number; // High
    l: number; // Low
    c: number; // Close
    v: number; // Volume
}

export interface ScreenerStockPick {
    symbol: string;
    name: string;
    reason: string;
    score: number;
}

export interface AiScreener {
    title: string;
    description: string;
    picks: ScreenerStockPick[];
}

export interface Transaction {
    id: string;
    type: 'BUY' | 'SELL' | 'OPTION_BUY' | 'OPTION_SELL';
    ticker: string;
    shares: number; // For stocks: shares, for options: contracts
    price: number; // Price per share/contract
    totalAmount: number; // Total cash moved
    timestamp: number;
    // Realized P&L details (only for 'SELL' and 'OPTION_SELL')
    purchasePrice?: number; // Original purchase price for calculating P&L
    realizedPnl?: number;
    // Options specific details
    optionSymbol?: string;
    optionType?: 'call' | 'put';
    strikePrice?: number;
}

interface YahooOptionContract {
    contractSymbol: string;
    strike: number;
    expiration: number;
    lastPrice: number;
    bid: number;
    ask: number;
    change: number;
    percentChange: number;
    volume: number;
    openInterest: number;
    impliedVolatility: number;
    inTheMoney: boolean;
    // FIX/ADDITION: Add the greeks directly as they exist in the raw response structure
    greeks?: {
        delta: number;
        gamma: number;
        theta: number;
        vega: number;
    };
    // ADDITION: Include these fields from the raw response to ensure type compatibility
    currency?: string; 
    contractSize?: string;
    lastTradeDate?: string; 
}