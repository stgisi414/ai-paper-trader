import { FMP_BASE_URL, FMP_API_KEY } from '../constants';
import { FmpQuote, FmpProfile, FmpSearchResult, FmpHistoricalData, FmpNews } from '../types';

const fetchFmp = async <T,>(endpoint: string): Promise<T> => {
    if (!FMP_API_KEY) {
        throw new Error("FMP API key is not configured.");
    }
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${FMP_BASE_URL}${endpoint}${separator}apikey=${FMP_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`FMP API request failed: ${response.statusText}`);
    }
    return response.json();
}

export const searchStocks = (query: string): Promise<FmpSearchResult[]> => {
    return fetchFmp<FmpSearchResult[]>(`/search?query=${query}`);
}

export const getQuote = (ticker: string): Promise<FmpQuote[]> => {
    return fetchFmp<FmpQuote[]>(`/quote/${ticker}`);
}

export const getProfile = (ticker: string): Promise<FmpProfile[]> => {
    return fetchFmp<FmpProfile[]>(`/profile/${ticker}`);
}

export const getHistoricalData = (ticker: string): Promise<{ historical: FmpHistoricalData[] }> => {
    return fetchFmp<{ historical: FmpHistoricalData[] }>(`/historical-price-full/${ticker}?serietype=line`);
}

export const getNews = (ticker: string, limit: number = 20): Promise<FmpNews[]> => {
    return fetchFmp<FmpNews[]>(`/stock_news?tickers=${ticker}&limit=${limit}`);
}