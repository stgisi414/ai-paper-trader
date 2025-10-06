// stgisi414/ai-paper-trader/ai-paper-trader-fa536df4e34394f0f513b8638ea6ea2daf383914/services/optionsProxyService.ts

import { AlpacaOptionContract } from '../types';
// IMPORT CLIENT-SIDE CALCULATOR
import { calculateGreeks } from '../utils/optionsCalculator';
import type { YahooOptionContract } from '../types';


export interface OptionsChainResult {
    contracts: AlpacaOptionContract[];
    availableExpirationDates: string[]; // List of all expiration dates
}

const OPTIONS_PROXY_URL = 'https://optionsproxy-gqoddifzlq-uc.a.run.app';

interface GreeksResult {
    delta: number | null;
    gamma: number | null;
    theta: number | null;
    vega: number | null;
}

interface OptionsChainResponse {
    underlyingSymbol: string;
    options: Array<{
        expirationDate: string | number; // <-- FIX: Correctly named property
        calls: YahooOptionContract[];
        puts: YahooOptionContract[];
    }>;
    expirationDates: (string | number)[];
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
export const getOptionsChain = async (symbol: string, date?: string): Promise<OptionsChainResult> => {
    if (!symbol) return { contracts: [], availableExpirationDates: [] };

    // MODIFICATION: Append the date to the URL if it exists
    let url = `${OPTIONS_PROXY_URL}?symbol=${symbol.toUpperCase()}`;
    if (date) {
        url += `&date=${date}`;
    }

    let rawJsonText = '';

    try {
        const response = await fetch(url);
        rawJsonText = await response.text();
        console.log(`Raw Options Data from Proxy for date: ${date || 'all'}`, rawJsonText);

        if (!response.ok) {
            console.error(`Options Proxy failed with status ${response.status}:`, rawJsonText);
            throw new Error(`Options Proxy failed: ${response.status} ${rawJsonText}`);
        }
        
        const data = JSON.parse(rawJsonText) as OptionsChainResponse;

        const optionsExpirationGroups = data.options;
        const currentStockPrice = data.quote?.regularMarketPrice;

        // Extract the full list of expiration dates from the top level
        const allExpirationDatesRaw = data.expirationDates || []; // <-- FIX: Use data.expirationDates directly
        const availableExpirationDates = allExpirationDatesRaw
            .map((dateRaw: string | number) => {
                // ADDITION: More robust date parsing for strings or timestamps (in seconds or ms)
                const dateNum = Number(dateRaw);
                let dateObj;
                if (typeof dateRaw === 'number' || !isNaN(dateNum)) {
                    const num = typeof dateRaw === 'number' ? dateRaw : dateNum;
                    // Check if it's likely seconds (10 digits) or milliseconds
                    dateObj = String(num).length > 10 ? new Date(num) : new Date(num * 1000);
                } else {
                    dateObj = new Date(dateRaw);
                }
                return isNaN(dateObj.getTime()) ? null : dateObj.toISOString().split('T')[0]; 
            })
            .filter(Boolean) as string[];

        
        if (!optionsExpirationGroups || optionsExpirationGroups.length === 0 || !currentStockPrice) {
             return { contracts: [], availableExpirationDates };
        }

        let allContracts: AlpacaOptionContract[] = [];
        
        // FIX: Define processContract inside getOptionsChain to resolve ReferenceError
        const processContract = (c: YahooOptionContract, type: 'call' | 'put', expirationDateRaw: string | number): AlpacaOptionContract | null => {
            
            // ADDITION: More robust date parsing for strings or timestamps (in seconds or ms)
            const dateNum = Number(expirationDateRaw);
            let dateObj;
            if (typeof expirationDateRaw === 'number' || !isNaN(dateNum)) {
                const num = typeof expirationDateRaw === 'number' ? expirationDateRaw : dateNum;
                dateObj = String(num).length > 10 ? new Date(num) : new Date(num * 1000);
            } else {
                dateObj = new Date(expirationDateRaw);
            }
            
            const expirationDate = isNaN(dateObj.getTime()) 
                                    ? 'N/A' 
                                    : dateObj.toISOString().split('T')[0]; 
            
            if (expirationDate === 'N/A') return null;


            const impliedVolatility = c.impliedVolatility || null;

            // Calculate Greeks LOCALLY using the imported function
            let greeks: GreeksResult | undefined = c.greeks;

            if (impliedVolatility !== null && impliedVolatility > 0 && currentStockPrice) {
                 greeks = calculateGreeks( 
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
        // End processContract definition

        // Collect all contracts synchronously as the heavy calculation is now local
        optionsExpirationGroups.forEach((optionGroup: any) => {
            // FIX: The yahoo-finance2 library now uses 'date' for the expiration in each group, not 'expirationDate'.
            const expirationDateRaw = optionGroup.expirationDate;

            const calls = optionGroup.calls.map((c: YahooOptionContract) => processContract(c, 'call', expirationDateRaw)).filter(Boolean) as AlpacaOptionContract[];
            const puts = optionGroup.puts.map((c: YahooOptionContract) => processContract(c, 'put', expirationDateRaw)).filter(Boolean) as AlpacaOptionContract[];

            allContracts.push(...calls, ...puts);
        });

        // Filter out contracts with no tradable price
        const contracts = allContracts.filter(c => c.close_price > 0);
        
        // MODIFICATION: Return contracts AND the full list of dates
        return { contracts, availableExpirationDates };

    } catch (error) {
        console.error("Failed to fetch options chain from proxy:", error);
        console.error("Raw response (if available):", rawJsonText);
        throw new Error("Failed to load options data.");
    }
};