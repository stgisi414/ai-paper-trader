// REMOVE ALL CONTENT and replace with the following simplified file.
import { ALPACA_API_KEY, ALPACA_SECRET_KEY } from '../constants';
import { AlpacaOptionsResponse, AlpacaOptionBar } from '../types';

// NOTE: This file is kept simple as we've offloaded options data to the Yahoo Finance proxy.

const fetchAlpaca = async <T,>(endpoint: string): Promise<T> => {
    if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
        throw new Error("Alpaca API keys are not configured.");
    }
    
    // This URL structure correctly fetches the contracts list with a paper trading key.
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

// NOTE: We are keeping the contract list function but it will now return incomplete data 
// compared to the proxy. We will prioritize the proxy for detailed options data.
export const getOptionsContracts = (underlyingSymbol: string): Promise<AlpacaOptionsResponse> => {
    return fetchAlpaca<AlpacaOptionsResponse>(`/options/contracts?underlying_symbol=${underlyingSymbol}`);
}

// REMOVED: getOptionBars is removed as it's not supported by paper API and we now have a better proxy.