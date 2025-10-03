// stgisi414/ai-paper-trader/ai-paper-trader-62753196656f768778662c9bd1a539920868b6d1/services/optionsProxyService.ts

import { AlpacaOptionContract } from '../types';
// IMPORT CLIENT-SIDE CALCULATOR
import { calculateGreeks } from '../utils/optionsCalculator';
import type { YahooOptionContract } from '../types';


const OPTIONS_PROXY_URL = 'https://optionsproxy-gqoddifzlq-uc.a.run.app';
// REMOVED: GREEKS_CALCULATOR_URL constant is no longer needed

// REMOVED: calculateGreeksRemotely is no longer needed

interface GreeksResult {
    delta: number | null;
    gamma: number | null;
    theta: number | null;
    vega: number | null;
}

interface OptionsChainResponse {
    // FIX 1: New top-level interface matching the actual Yahoo Finance response
    underlyingSymbol: string;
    options: Array<{
        expirationDate: string | number; // <-- Updated type to be safe for epoch/string
        calls: YahooOptionContract[];
        puts: YahooOptionContract[];
    }>;
    // ADDITION: Define quote structure to extract current price (S)
    quote: {
        regularMarketPrice: number;
        [key: string]: any; 
    };
    [key: string]: any;
}

/**
 * Fetches the options chain for a given symbol from the Firebase proxy.
 * This function consolidates the nested Yahoo Finance response into a flat array.
 * @param symbol The stock ticker symbol.
 */
export const getOptionsChain = async (symbol: string): Promise<AlpacaOptionContract[]> => {
    if (!symbol) return [];

    const url = `${OPTIONS_PROXY_URL}?symbol=${symbol.toUpperCase()}`;
    let rawJsonText = '';

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Options Proxy failed with status ${response.status}:`, errorText);
            throw new Error(`Options Proxy failed: ${response.status} ${errorText}`);
        }
        
        rawJsonText = await response.text();
        console.log('Raw Options Proxy Response Text:', rawJsonText);

        const data = JSON.parse(rawJsonText) as OptionsChainResponse;
        console.log('Parsed Options Proxy Data Object:', data);

        const optionsExpirationGroups = data.options;
        // EXTRACT CURRENT PRICE
        const currentStockPrice = data.quote?.regularMarketPrice;
        
        if (!optionsExpirationGroups || optionsExpirationGroups.length === 0 || !currentStockPrice) return [];

        let allContracts: AlpacaOptionContract[] = [];
        
        // Function to process and normalize a single contract
        const processContract = (c: YahooOptionContract, type: 'call' | 'put', expirationDateRaw: string | number): AlpacaOptionContract | null => {
            
            const dateObj = new Date(expirationDateRaw);
            const expirationDate = isNaN(dateObj.getTime()) 
                                    ? 'N/A' 
                                    : dateObj.toISOString().split('T')[0]; 
            
            if (expirationDate === 'N/A') return null;

            const impliedVolatility = c.impliedVolatility || null;

            // NEW LOGIC: Calculate Greeks LOCALLY using the imported function
            let greeks: GreeksResult | undefined = c.greeks;

            if (impliedVolatility !== null && impliedVolatility > 0 && currentStockPrice) {
                 greeks = calculateGreeks( // CALL LOCAL FUNCTION
                    type, 
                    currentStockPrice, 
                    c.strike, 
                    expirationDate, 
                    impliedVolatility
                );
            }
            
            return {
                symbol: c.contractSymbol,
                name: c.contractSymbol,
                status: 'active',
                tradable: true,
                id: c.contractSymbol, 
                asset_class: 'option',
                exchange: 'N/A', 
                style: type, 
                type: type,
                expiration_date: expirationDate, 
                strike_price: String(c.strike),
                underlying_symbol: symbol.toUpperCase(),
                close_price: c.lastPrice || c.bid || 0,
                volume: c.volume || 0,
                open_interest: c.openInterest || 0,
                // Use calculated or fetched greeks
                delta: greeks?.delta || null,
                gamma: greeks?.gamma || null,
                theta: greeks?.theta || null,
                vega: greeks?.vega || null,
                impliedVolatility: impliedVolatility,
            };
        };

        // Collect all contracts synchronously as the heavy calculation is now local
        optionsExpirationGroups.forEach((optionGroup: any) => { 
            const expirationDateRaw = optionGroup.expirationDate;

            const calls = optionGroup.calls.map((c: YahooOptionContract) => processContract(c, 'call', expirationDateRaw)).filter(Boolean) as AlpacaOptionContract[];
            const puts = optionGroup.puts.map((c: YahooOptionContract) => processContract(c, 'put', expirationDateRaw)).filter(Boolean) as AlpacaOptionContract[];

            allContracts.push(...calls, ...puts);
        });

        // Filter out contracts with no tradable price
        return allContracts.filter(c => c.close_price > 0);

    } catch (error) {
        console.error("Failed to fetch options chain from proxy:", error);
        console.error("Raw response (if available):", rawJsonText);
        throw new Error("Failed to load options data.");
    }
};