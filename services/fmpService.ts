import { FMP_BASE_URL, FMP_API_KEY } from '../constants';
import { FmpQuote, FmpProfile, FmpSearchResult, FmpHistoricalData, FmpNews, FmpOptionChain, FmpOptionsPositionSummary, FmpAnalystRating, FmpPriceTarget, FmpIncomeStatement, FmpBalanceSheet, FmpCashFlowStatement, FmpInsiderTrading } from '../types';

const fetchFmp = async <T,>(endpoint: string): Promise<T> => {
    if (!FMP_API_KEY) {
        throw new Error("FMP API key is not configured.");
    }
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${FMP_BASE_URL}${endpoint}${separator}apikey=${FMP_API_KEY}`;
    
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                if (response.status >= 400 && response.status < 500) {
                     throw new Error(`API request failed with status ${response.status}`);
                }
                throw new Error(`API request failed: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            lastError = error as Error;
            if (attempt === maxRetries) {
                console.error(`Fetch failed after ${maxRetries} attempts for ${url}`);
                break; 
            }
            console.warn(`Attempt ${attempt} for ${url} failed. Retrying...`);
            await new Promise(res => setTimeout(res, 500 * attempt));
        }
    }
    throw lastError || new Error("An unexpected error occurred in fetchFmp.");
};


export const searchStocks = (query: string): Promise<FmpSearchResult[]> => {
    return fetchFmp<FmpSearchResult[]>(`/search?query=${query}`);
}

export const getQuote = (ticker: string): Promise<FmpQuote[]> => {
    return fetchFmp<FmpQuote[]>(`/quote/${ticker}`);
}

export const getProfile = (ticker: string): Promise<FmpProfile[]> => {
    return fetchFmp<FmpProfile[]>(`/profile/${ticker}`);
}

export const getHistoricalData = (ticker: string, interval: string = '1day'): Promise<{ historical: FmpHistoricalData[] }> => {
    if (['15min', '1hour', '4hour'].includes(interval)) {
        // Use the intraday endpoint for these intervals
        return fetchFmp<FmpHistoricalData[]>(`/historical-chart/${interval}/${ticker}`).then(data => ({ historical: data }));
    }

    // For daily, weekly, and monthly views, we'll fetch daily data over different time ranges.
    const to = new Date().toISOString().split('T')[0];
    let from;
    if (interval === '1week') {
        // Fetch 2 years of daily data for the "weekly" view
        from = new Date(new Date().setFullYear(new Date().getFullYear() - 2)).toISOString().split('T')[0];
    } else if (interval === '1month') {
        // Fetch 5 years of daily data for the "monthly" view
        from = new Date(new Date().setFullYear(new Date().getFullYear() - 5)).toISOString().split('T')[0];
    } else { // '1day'
        // Fetch 1 year of daily data for the "daily" view
        from = new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0];
    }
    return fetchFmp<{ historical: FmpHistoricalData[] }>(`/historical-price-full/${ticker}?from=${from}&to=${to}`);
}

export const getNews = (ticker: string, limit: number = 20): Promise<FmpNews[]> => {
    return fetchFmp<FmpNews[]>(`/stock_news?tickers=${ticker}&limit=${limit}`);
}

// NEW: Fetches the entire option chain for a given stock
export const getOptionChain = (ticker: string): Promise<FmpOptionChain[]> => {
    // Note: The API returns an array, but it usually contains a single element for a single ticker.
    return fetchFmp<FmpOptionChain[]>(`/stock_option_chain?symbol=${ticker}`);
}

// NEW: Fetches the put/call ratio and total positions
export const getOptionsPositionSummary = (ticker: string): Promise<FmpOptionsPositionSummary[]> => {
    // This uses the v4 endpoint.
    return fetchFmp<FmpOptionsPositionSummary[]>(`/v4/option/positions/summary?symbol=${ticker}`);
}

// NEW: Fetches analyst ratings for a given stock
export const getAnalystRatings = (ticker: string): Promise<FmpAnalystRating[]> => {
    return fetchFmp<FmpAnalystRating[]>(`/analyst-stock-recommendations/${ticker}`);
}

// NEW: Fetches price targets for a given stock
export const getPriceTargets = (ticker: string): Promise<FmpPriceTarget[]> => {
    return fetchFmp<FmpPriceTarget[]>(`/price-target/${ticker}`);
}

// NEW: Fetches the income statement for a given stock
export const getIncomeStatement = (ticker: string): Promise<FmpIncomeStatement[]> => {
    return fetchFmp<FmpIncomeStatement[]>(`/income-statement/${ticker}?period=annual`);
}

// NEW: Fetches the balance sheet for a given stock
export const getBalanceSheet = (ticker: string): Promise<FmpBalanceSheet[]> => {
    return fetchFmp<FmpBalanceSheet[]>(`/balance-sheet-statement/${ticker}?period=annual`);
}

// NEW: Fetches the cash flow statement for a given stock
export const getCashFlowStatement = (ticker: string): Promise<FmpCashFlowStatement[]> => {
    return fetchFmp<FmpCashFlowStatement[]>(`/cash-flow-statement/${ticker}?period=annual`);
}

// NEW: Fetches insider trading information for a given stock
export const getInsiderTrading = (ticker: string): Promise<FmpInsiderTrading[]> => {
    // We construct the full URL here to override the default v3 base path
    const endpoint = `https://financialmodelingprep.com/api/v4/insider-trading?symbol=${ticker}&page=0&apikey=${FMP_API_KEY}`;
    
    // We need to call fetch directly here instead of our helper function
    return fetch(endpoint).then(res => res.json());
}