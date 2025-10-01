import { ALPACA_BASE_URL, ALPACA_API_KEY, ALPACA_SECRET_KEY } from '../constants';
import { AlpacaOptionsResponse } from '../types';

const fetchAlpaca = async <T,>(endpoint: string): Promise<T> => {
    if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
        throw new Error("Alpaca API keys are not configured.");
    }

    const url = `https://paper-api.alpaca.markets/v2/options${endpoint}`;

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
    return fetchAlpaca<AlpacaOptionsResponse>(`/contracts?underlying_symbol=${underlyingSymbol}`);
}