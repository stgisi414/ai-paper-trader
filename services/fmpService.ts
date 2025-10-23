// services/fmpService.ts
import { FMP_BASE_URL } from '../constants';
// ... other imports ...

const fetchFmp = async <T,>(endpoint: string): Promise<T> => {
    // Construct the URL correctly with the endpoint as a query parameter
    const url = `${FMP_BASE_URL}?endpoint=${encodeURIComponent(endpoint)}`;
    console.log(`[FMP Service] Fetching URL: ${url}`); // Add log to see final URL
    
    const maxRetries = 3;
    let lastError: Error | null = null;
    let responseText = ''; // Variable to store raw response text

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[FMP Service] Attempt ${attempt}: Fetching ${url}`); // Add logging
            const response = await fetch(url);
            responseText = await response.text(); // Read text response immediately

            if (!response.ok) {
                // Log the non-OK response text for debugging
                console.error(`FMP Proxy Error ${response.status} on attempt ${attempt} for ${url}. Response:`, responseText);
                // Throw specific errors for client vs server issues
                if (response.status === 404) {
                     throw new Error(`Proxy endpoint not found (404). Check Vite config/server status.`);
                } else if (response.status >= 400 && response.status < 500) {
                     throw new Error(`API request failed with client error ${response.status}. Response: ${responseText.substring(0, 100)}...`);
                }
                throw new Error(`API request failed: ${response.statusText}. Response: ${responseText.substring(0, 100)}...`);
            }

            // Try to parse ONLY if response.ok
            try {
                return JSON.parse(responseText);
            } catch (parseError) {
                // Throw specific error if JSON parsing fails on an OK response
                console.error(`Failed to parse JSON response for ${url}. Response Text:`, responseText);
                throw new Error(`Received non-JSON response from proxy: ${responseText.substring(0, 100)}...`);
            }

        } catch (error) {
            lastError = error as Error;
            if (attempt === maxRetries) {
                console.error(`Fetch failed after ${maxRetries} attempts for ${url}. Last error:`, lastError.message);
                // Include response text in the final thrown error if available
                if (responseText && !lastError.message.includes("Raw response")) {
                   lastError = new Error(`${lastError.message}. Raw response started with: ${responseText.substring(0, 100)}...`);
                }
                break;
            }
            console.warn(`Attempt ${attempt} for ${url} failed. Retrying... Error:`, (error as Error).message);
            await new Promise(res => setTimeout(res, 500 * attempt));
        }
    }
    // Ensure a detailed error is thrown
    throw lastError || new Error(`An unexpected error occurred in fetchFmp for ${url}.`);
};

// ... rest of the file (getQuote, getProfile, etc.) ...
export const searchStocks = (query: string): Promise<FmpSearchResult[]> => {
    return fetchFmp<FmpSearchResult[]>(`/v3/search?query=${query}`); // Pass endpoint starting with "/"
}

export const getQuote = (ticker: string): Promise<FmpQuote[]> => {
    return fetchFmp<FmpQuote[]>(`/v3/quote/${ticker}`); // Pass endpoint starting with "/"
}

export const getProfile = (ticker: string): Promise<FmpProfile[]> => {
    return fetchFmp<FmpProfile[]>(`/v3/profile/${ticker}`); // Pass endpoint starting with "/"
}

// ... ensure all other exported functions pass the endpoint starting with "/" ...
export const getHistoricalData = (ticker: string, interval: string = '1day'): Promise<{ historical: FmpHistoricalData[] }> => {
    let endpoint = ''; // Initialize endpoint variable

    if (['15min', '1hour', '4hour'].includes(interval)) {
        // Use the intraday endpoint for these intervals
        endpoint = `/v3/historical-chart/${interval}/${ticker}`;
        // Fetch and process directly for intraday
        return fetchFmp<FmpHistoricalData[]>(endpoint).then(data => ({ historical: data }));
    } else {
        // For daily, weekly, and monthly views, fetch daily data over different time ranges.
        const to = new Date().toISOString().split('T')[0];
        let fromDate = new Date(); // Use a mutable Date object
        let from;
        
        // --- FIX: Correctly calculate the historical start date based on the desired view ---
        if (interval === '1week') {
            // A common range for a '1 week' *view* on a daily chart is 3 months of data, or 1 year.
            // Using 2 years as originally intended, which provides enough data for weekly aggregation if needed.
            fromDate.setFullYear(fromDate.getFullYear() - 2); 
            from = fromDate.toISOString().split('T')[0];
            
        } else if (interval === '1month') {
            // Use 5 years for the '1 month' view (long-term data)
            fromDate.setFullYear(fromDate.getFullYear() - 5);
            from = fromDate.toISOString().split('T')[0];

        } else { // '1day' default (should show around 1 year of daily data)
            fromDate.setFullYear(fromDate.getFullYear() - 1);
            from = fromDate.toISOString().split('T')[0];
        }
        // --- END FIX ---
        
        endpoint = `/v3/historical-price-full/${ticker}?from=${from}&to=${to}`;
        // Fetch and process for daily historical
        return fetchFmp<{ historical: FmpHistoricalData[] }>(endpoint); // Assuming FMP returns { historical: [...] }
    }
}


export const getNews = (ticker: string, limit: number = 20): Promise<FmpNews[]> => {
    return fetchFmp<FmpNews[]>(`/v3/stock_news?tickers=${ticker}&limit=${limit}`);
}

export const getOptionsPositionSummary = (ticker: string): Promise<FmpOptionsPositionSummary[]> => {
    return fetchFmp<FmpOptionsPositionSummary[]>(`/v4/option/positions/summary?symbol=${ticker}`);
}

export const getAnalystRatings = (ticker: string): Promise<FmpAnalystRating[]> => {
    return fetchFmp<FmpAnalystRating[]>(`/v3/analyst-stock-recommendations/${ticker}`);
}

export const getPriceTargets = (ticker: string): Promise<FmpPriceTarget[]> => {
    return fetchFmp<FmpPriceTarget[]>(`/v3/price-target/${ticker}`);
}

export const getIncomeStatement = (ticker: string): Promise<FmpIncomeStatement[]> => {
    return fetchFmp<FmpIncomeStatement[]>(`/v3/income-statement/${ticker}?period=annual`);
}

export const getBalanceSheet = (ticker: string): Promise<FmpBalanceSheet[]> => {
    return fetchFmp<FmpBalanceSheet[]>(`/v3/balance-sheet-statement/${ticker}?period=annual`);
}

export const getCashFlowStatement = (ticker: string): Promise<FmpCashFlowStatement[]> => {
    return fetchFmp<FmpCashFlowStatement[]>(`/v3/cash-flow-statement/${ticker}?period=annual`);
}

export const getInsiderTrading = (ticker: string): Promise<FmpInsiderTrading[]> => {
    return fetchFmp<FmpInsiderTrading[]>(`/v4/insider-trading?symbol=${ticker}&page=0`);
}

export const getGeneralNews = (limit: number = 10): Promise<FmpNews[]> => {
    return fetchFmp<FmpNews[]>(`/v3/stock_news?limit=${limit}`);
}