import { ALPACA_BASE_URL } from '../constants';
import { AlpacaOptionsResponse } from '../types';

const fetchAlpaca = async <T,>(endpoint: string): Promise<T> => {
    const url = `${ALPACA_BASE_URL}${endpoint}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Alpaca API request failed: ${response.status} ${errorText}`);
    }
    return await response.json();
};

export const getOptionsContracts = (underlyingSymbol: string): Promise<AlpacaOptionsResponse> => {
    return fetchAlpaca<AlpacaOptionsResponse>(`/options/contracts?underlying_symbol=${underlyingSymbol}`);
}