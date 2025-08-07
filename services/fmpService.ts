import { FMP_BASE_URL, FMP_API_KEY } from '../constants';
import { FmpQuote, FmpProfile, FmpSearchResult, FmpHistoricalData, FmpNews } from '../types';

const fetchFmp = async <T,>(endpoint: string): Promise<T> => {
    if (!FMP_API_KEY) {
        throw new Error("FMP API key is not configured.");
    }
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${FMP_BASE_URL}${endpoint}${separator}apikey=${FMP_API_KEY}`;
    
    // --- Retry Logic for Network Errors ---
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                // Don't retry on client errors (like 401/404), as they won't succeed.
                if (response.status >= 400 && response.status < 500) {
                     throw new Error(`API request failed with status ${response.status}`);
                }
                // For other errors (like 500 server errors or network issues), throw to trigger a retry.
                throw new Error(`API request failed: ${response.statusText}`);
            }
            return await response.json(); // Success
        } catch (error) {
            lastError = error as Error;
            if (attempt === maxRetries) {
                console.error(`Fetch failed after ${maxRetries} attempts for ${url}`);
                break; // Exit loop and throw the last known error
            }
            console.warn(`Attempt ${attempt} for ${url} failed. Retrying...`);
            // Wait for a short, increasing delay before the next attempt
            await new Promise(res => setTimeout(res, 500 * attempt));
        }
    }
    throw lastError || new Error("An unexpected error occurred in fetchFmp.");
};


export const searchStocks = (query: string): Promise<FmpSearchResult[]> => {
    // The endpoint was updated to the correct version.
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