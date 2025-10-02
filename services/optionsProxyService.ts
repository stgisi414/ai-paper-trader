import { AlpacaOptionContract } from '../types';

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
        expirationDate: string; // The date is now a string, not a number (epoch)
        calls: YahooOptionContract[];
        puts: YahooOptionContract[];
    }>;
    // Add other relevant root fields if needed, but not strictly required for logic
    quote?: any;
}

/**
 * Fetches the options chain for a given symbol from the Firebase proxy.
 * This function consolidates the nested Yahoo Finance response into a flat array.
 * @param symbol The stock ticker symbol.
 */
export const getOptionsChain = async (symbol: string): Promise<AlpacaOptionContract[]> => {
    if (!symbol) return [];

    const url = `${OPTIONS_PROXY_URL}?symbol=${symbol.toUpperCase()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            const errorText = await response.text();
            // ADDED: Log the error response text to the console
            console.error(`Options Proxy failed with status ${response.status}:`, errorText);
            throw new Error(`Options Proxy failed: ${response.status} ${errorText}`);
        }
        
        // ADDED: Read the raw text, log it, and then parse it
        const rawJsonText = await response.text();
        console.log('Raw Options Proxy Response Text:', rawJsonText); // <-- Check this first!

        const data = JSON.parse(rawJsonText) as OptionsChainResponse;
        console.log('Parsed Options Proxy Data Object:', data); // <-- Check this second!

        const optionsResultList = data.optionChain?.result;
        
        if (!optionsResultList || optionsResultList.length === 0) return [];
        
        const optionsResult = optionsResultList[0];
        if (!optionsResult || !optionsResult.options) return [];

        let allContracts: AlpacaOptionContract[] = [];

        optionsResult.options.forEach(optionGroup => {
            const expirationDate = new Date(optionGroup.expirationDate * 1000).toISOString().split('T')[0];
            
            // Function to process and normalize a contract
            const processContract = (c: YahooOptionContract, type: 'call' | 'put'): AlpacaOptionContract => ({
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
                close_price: c.lastPrice || c.bid || 0, // Fallback to bid if lastPrice is missing
                volume: c.volume || 0,
                open_interest: c.openInterest || 0,
                delta: c.greeks?.delta || null,
                gamma: c.greeks?.gamma || null,
                theta: c.greeks?.theta || null,
                vega: c.greeks?.vega || null,
                impliedVolatility: c.impliedVolatility || null,
            });

            allContracts.push(...optionGroup.calls.map(c => processContract(c, 'call')));
            allContracts.push(...optionGroup.puts.map(c => processContract(c, 'put')));
        });

        // Filter out contracts with no tradable price
        return allContracts.filter(c => c.close_price > 0);

    } catch (error) {
        console.error("Failed to fetch options chain from proxy:", error);
        throw new Error("Failed to load options data.");
    }
};