// stgisi414/ai-paper-trader/ai-paper-trader-1aba57e32cc684602a69e276de1a20c554fe5223/services/optionsProxyService.ts

import { AlpacaOptionContract } from '../types';
import { calculateGreeks } from '../utils/optionsCalculator'; // <--- Now uses correct Black-Scholes calls

const OPTIONS_PROXY_URL = 'https://optionsproxy-gqoddifzlq-uc.a.run.app';

interface YahooOptionContract {
    contractSymbol: string;
    strike: number;
    expiration: number;
    lastPrice: number;
    bid: number;
    ask: number;
    change: number;
    percentChange: number;
    volume: number;
    openInterest: number;
    impliedVolatility: number;
    inTheMoney: boolean;
    // Greeks from yahoo-finance2 (or similar)
    greeks?: {
        delta: number;
        gamma: number;
        theta: number;
        vega: number;
    };
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
    let rawJsonText = ''; // FIX: Declare rawJsonText outside try block

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            // ADDED: Log the error response text to the console
            console.error(`Options Proxy failed with status ${response.status}:`, errorText);
            throw new Error(`Options Proxy failed: ${response.status} ${errorText}`);
        }
        
        // ADDED: Read the raw text, log it, and then parse it
        rawJsonText = await response.text();
        console.log('Raw Options Proxy Response Text:', rawJsonText); // <-- Check this first!

        const data = JSON.parse(rawJsonText) as OptionsChainResponse; // Use the updated interface
        console.log('Parsed Options Proxy Data Object:', data); // <-- Check this second!

        // --- START FIX: Correctly access the array of option groups from the top level ---
        const optionsExpirationGroups = data.options;
        // EXTRACT CURRENT PRICE
        const currentStockPrice = data.quote?.regularMarketPrice;
        
        if (!optionsExpirationGroups || optionsExpirationGroups.length === 0 || !currentStockPrice) return [];

        let allContracts: AlpacaOptionContract[] = [];
        
        // Function to process and normalize a contract
        const processContract = (c: YahooOptionContract, type: 'call' | 'put', expirationDateRaw: string | number): AlpacaOptionContract | null => {
            
            // FIX: Robust Date conversion and validation
            const dateObj = new Date(expirationDateRaw);
            const expirationDate = isNaN(dateObj.getTime()) 
                                    ? 'N/A' 
                                    : dateObj.toISOString().split('T')[0]; 
            
            if (expirationDate === 'N/A') return null;

            const impliedVolatility = c.impliedVolatility || null;
            let greeks = c.greeks;

            // NEW LOGIC: Calculate Greeks if impliedVolatility is present AND Yahoo data did not return them
            if (!greeks && impliedVolatility !== null && impliedVolatility > 0 && currentStockPrice) {
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
                expiration_date: expirationDate, // Use the correctly formatted date string
                strike_price: String(c.strike),
                underlying_symbol: symbol.toUpperCase(),
                close_price: c.lastPrice || c.bid || 0, // Fallback to bid if lastPrice is missing
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

        // FIX: Iterate over the correctly identified array.
        optionsExpirationGroups.forEach((optionGroup: any) => { 
            const expirationDateRaw = optionGroup.expirationDate; // raw date is string or number

            // Apply processContract and filter out null returns
            const calls = optionGroup.calls.map((c: YahooOptionContract) => processContract(c, 'call', expirationDateRaw)).filter(Boolean) as AlpacaOptionContract[];
            const puts = optionGroup.puts.map((c: YahooOptionContract) => processContract(c, 'put', expirationDateRaw)).filter(Boolean) as AlpacaOptionContract[];

            allContracts.push(...calls, ...puts);
        });

        // Filter out contracts with no tradable price
        return allContracts.filter(c => c.close_price > 0);
        // --- END FIX ---

    } catch (error) {
        console.error("Failed to fetch options chain from proxy:", error);
        console.error("Raw response (if available):", rawJsonText);
        throw new Error("Failed to load options data.");
    }
};