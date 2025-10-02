import { ALPACA_BASE_URL, ALPACA_API_KEY, ALPACA_SECRET_KEY } from '../constants';
import { AlpacaOptionsResponse, AlpacaOptionBar } from '../types';

const fetchAlpaca = async <T,>(endpoint: string, apiVersion: 'v2' | 'v1beta1' = 'v2'): Promise<T> => {
    if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) {
        throw new Error("Alpaca API keys are not configured.");
    }

    const baseUrl = apiVersion === 'v1beta1' ? 'https://data.alpaca.markets/v1beta1/options' : `https://paper-api.alpaca.markets/v2/options`;
    const url = `${baseUrl}${endpoint}`;

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

export const getOptionBar = (symbol: string): Promise<{ bars: AlpacaOptionBar[] }> => {
    const today = new Date().toISOString().split('T')[0];
    return fetchAlpaca<{ bars: AlpacaOptionBar[] }>(`/bars?symbols=${symbol}&timeframe=1Day&start=${today}`, 'v1beta1');
}

export const getOptionBars = (symbols: string[]): Promise<{ bars: Record<string, AlpacaOptionBar[]> }> => {
    if (symbols.length === 0) return Promise.resolve({ bars: {} });
    const today = new Date().toISOString().split('T')[0];
    const symbolsString = symbols.join(',');
    return fetchAlpaca<{ bars: Record<string, AlpacaOptionBar[]> }>(`/bars?symbols=${symbolsString}&timeframe=1Day&start=${today}`, 'v1beta1');
}