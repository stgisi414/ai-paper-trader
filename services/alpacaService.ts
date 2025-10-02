import { ALPACA_API_KEY, ALPACA_SECRET_KEY } from '../constants';
import { AlpacaOptionsResponse, AlpacaOptionBar } from '../types';

const fetchAlpaca = async <T,>(endpoint: string): Promise<T> => {
    if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
        throw new Error("Alpaca API keys are not configured.");
    }
    
    // This URL structure correctly fetches the options contract list with a paper trading key.
    const url = `https://paper-api.alpaca.markets/v2${endpoint}`;

    const headers = new Headers();
    headers.append('APCA-API-KEY-ID', ALPACA_API_KEY);
    headers.append('APCA-API-SECRET-KEY', ALPACA_SECRET_KEY);
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Alpaca API request failed: ${response.status} ${errorText}`);
    }
    return await response.json();
};


export const getOptionsContracts = (underlyingSymbol: string): Promise<AlpacaOptionsResponse> => {
    return fetchAlpaca<AlpacaOptionsResponse>(`/options/contracts?underlying_symbol=${underlyingSymbol}`);
}

// NOTE: The paper trading API does not support fetching latest bars/volume for options.
// These functions are left here but should not be used with a paper-only key.
export const getOptionBars = (symbols: string[]): Promise<{ bars: Record<string, AlpacaOptionBar> }> => {
    console.warn("getOptionBars requires a Market Data API subscription and will not work with a paper-trading-only key.");
    return Promise.resolve({ bars: {} });
}