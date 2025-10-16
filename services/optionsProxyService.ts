import { AlpacaOptionContract } from '../types';
import { calculateGreeks } from '../utils/optionsCalculator';
import type { YahooOptionContract } from '../types';
import { OPTIONS_PROXY_URL } from '../constants';


export interface OptionsChainResult {
    contracts: AlpacaOptionContract[];
    availableExpirationDates: string[]; // List of all expiration dates
}

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
    console.log(`[OPTIONS PROXY STEP 1] Fetching chain for symbol: ${symbol}, date: ${date || 'next available'}`);
    if (!symbol) {
        console.log(`[OPTIONS PROXY STEP 1 FAIL] No symbol provided.`);
        return { contracts: [], availableExpirationDates: [] };
    }

    const params = new URLSearchParams({ symbol: symbol.toUpperCase() });
    if (date) {
        params.append('date', date);
    }
    const url = `${OPTIONS_PROXY_URL}?${params.toString()}`;

    let rawJsonText = '';

    try {
        const response = await fetch(url);
        rawJsonText = await response.text();
        console.log(`[OPTIONS PROXY STEP 2] Raw JSON received (first 200 chars): ${rawJsonText.substring(0, 200)}...`);

        if (!response.ok) {
            console.error(`[OPTIONS PROXY STEP 2 FAIL] Options Proxy failed with status ${response.status}:`, rawJsonText);
            throw new Error(`Options Proxy failed: ${response.status} ${rawJsonText}`);
        }
        
        const data = JSON.parse(rawJsonText) as OptionsChainResponse;

        const optionsExpirationGroups = data.options;
        const currentStockPrice = data.quote?.regularMarketPrice;

        console.log(`[OPTIONS PROXY STEP 3] Extracted Data: Stock Price: ${currentStockPrice}, Groups Found: ${optionsExpirationGroups?.length}`);

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
             console.log(`[OPTIONS PROXY STEP 5] Returning 0 contracts (missing data or stock price).`);
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

            // IMPORTANT: Determine the best 'close price' available.
            let closePrice = c.lastPrice || c.bid || c.ask || 0;
            
            // --- CRITICAL FIX: Ensure ITM price reflects intrinsic value (floor) ---
            const strike = c.strike;
            
            // Calculate Intrinsic Value (IV)
            let intrinsicValue = 0;
            if (type === 'call' && currentStockPrice > strike) {
                intrinsicValue = currentStockPrice - strike;
            } else if (type === 'put' && currentStockPrice < strike) {
                intrinsicValue = strike - currentStockPrice;
            }
            
            // Use Intrinsic Value if the reported market price is unrealistically low
            if (intrinsicValue > closePrice) {
                console.log(`[OPTIONS PROXY DEBUG] Setting price for ${c.contractSymbol} to Intrinsic Value. Old: ${closePrice}, New (IV): ${intrinsicValue}`);
                closePrice = intrinsicValue;
            } else if (closePrice === 0 && (c.lastPrice === 0 || c.bid === 0 || c.ask === 0)) {
                console.log(`[OPTIONS PROXY DEBUG] Contract ${c.contractSymbol} has zero price. Including it.`);
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
                close_price: closePrice,
                change: c.change || 0,
                changesPercentage: c.percentChange || 0,
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
            // FIX: Handle both 'date' and 'expirationDate' properties from the API
            const expirationDateRaw = optionGroup.date || optionGroup.expirationDate;

            // ADDITION: If for some reason neither exists, skip this group.
            if (!expirationDateRaw) {
                console.warn("Skipping option group with no date:", optionGroup);
                return; 
            }

            const calls = optionGroup.calls.map((c: YahooOptionContract) => processContract(c, 'call', expirationDateRaw)).filter(Boolean) as AlpacaOptionContract[];
            const puts = optionGroup.puts.map((c: YahooOptionContract) => processContract(c, 'put', expirationDateRaw)).filter(Boolean) as AlpacaOptionContract[];

            allContracts.push(...calls, ...puts);
        });

        // FIX: Only filter out contracts where close_price is explicitly null or undefined,
        // allowing a valid premium of 0 or a positive value to pass through.
        const contracts = allContracts.filter(c => c.close_price !== null && c.close_price !== undefined);

        console.log(`[OPTIONS PROXY STEP 6] Total Contracts before filter: ${allContracts.length}, after filter: ${contracts.length}`);
        
        // MODIFICATION: Return contracts AND the full list of dates
        return { contracts, availableExpirationDates };

    } catch (error) {
        console.error("[OPTIONS PROXY STEP FAIL] Failed to fetch options chain from proxy:", error);
        console.error("Raw response (if available):", rawJsonText);
        throw new Error("Failed to load options data.");
    }
};