import {onRequest} from "firebase-functions/v2/https";
import {Request, Response} from "express";
import * as logger from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import {getFirestore, FieldValue,
  DocumentSnapshot} from "firebase-admin/firestore";
import {defineString} from "firebase-functions/params";
import {
  GoogleGenAI,
  FunctionDeclaration,
  Content,
  Tool,
  Type,
} from "@google/genai";
import {onDocumentWritten,
  Change, FirestoreEvent} from "firebase-functions/v2/firestore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ToolFunction = (args: any) => Promise<any>;

interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface OptionGroup {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calls: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  puts: any[];
  // The expirationDate property also exists but is
  // not strictly needed for this loop's typing
}

initializeApp();

// Ensure your environment variables are set correctly for these keys
const fmpApiKey = defineString("FMP_API_KEY");
const alpacaApiKey = defineString("ALPACA_API_KEY");
const alpacaApiSecret = defineString("ALPACA_SECRET_KEY");
const geminiApiKey = defineString("GEMINI_API_KEY");

// --- START: AI TOOLS ---

const fetchFmpApi = async (endpoint: string) => {
  const apiKey = fmpApiKey.value();
  if (!apiKey) {
    logger.error("FMP_API_KEY is not configured.");
    return {error: "FMP API Key is missing.", status: 500};
  }
  const queryDelimiter = endpoint.includes("?") ? "&" : "?";
  const url = `https://financialmodelingprep.com/api${endpoint}${queryDelimiter}apikey=${apiKey}`;
  logger.info(`Fetching FMP URL: ${url.replace(apiKey, "REDACTED")}`);
  try {
    const apiResponse = await fetch(url);
    const responseText = await apiResponse.text();
    if (!apiResponse.ok) {
      logger.error(`FMP API Error ${apiResponse.status}:`, responseText);
      return {error: `FMP API Error: ${responseText}`,
        status: apiResponse.status};
    }
    return {data: JSON.parse(responseText), status: 200};
  } catch (error) {
    logger.error("FMP Fetch Error:", error);
    return {error: "Failed to connect to FMP API.", status: 500};
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yfClient: any = null;
const loadYahooFinanceClient = async () => {
  if (yfClient === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      yfClient = require("yahoo-finance2").default || require("yahoo-finance2");
    } catch (err) {
      logger.error("Failed to load options client.", err);
      throw new Error("Options client initialization failed.");
    }
  }
};

const fetchOptionsApi = async (symbol: string, date?: string) => {
  await loadYahooFinanceClient();
  logger.info(`Fetching options for ${symbol}
    on date ${date || "next available"}`);
  try {
    const yfQueryOptions: { date?: Date } = {};
    if (date) {
      // Ensure date is parsed correctly as UTC midnight
      yfQueryOptions.date = new Date(`${date}T00:00:00.000Z`);
    }

    const optionsChain = await yfClient.options(symbol.toUpperCase(),
      yfQueryOptions);
    if (!optionsChain) {
      const errorMsg = `No options found for ${symbol}`;
      logger.warn(errorMsg);
      return {error: errorMsg, status: 404};
    }
    return {data: optionsChain, status: 200, error: null};
  } catch (e) {
    const errorMsg = `Failed to fetch options for ${symbol}`;
    logger.error(errorMsg, e);
    return {error: errorMsg, status: 500, data: undefined};
  }
};

const getOptionsChain = async (
  {symbol, date}: {symbol: string, date?: string}) => {
  logger.info(`AI Tool: Calling getOptionsChain
    for ${symbol} with date: ${date}`);

  // 1. Initial fetch (fetches next expiry & all dates list if date is missing)
  const initialResult = await fetchOptionsApi(symbol, undefined) as {data:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {options: OptionGroup[], expirationDates: any, quote: any},
      error: string | null};

  if (initialResult.error || !initialResult.data) {
    return {error: initialResult.error};
  }

  const {data} = initialResult;
  // Get all unique expiration dates (converted to YYYY-MM-DD format)
  const allExpirationDates: string[] = Array.from(new Set(
    data.expirationDates.map((expDateRaw: string | number) => {
      const expDateNum = Number(expDateRaw);
      let dateObj;
      if (typeof expDateRaw === "number" || !isNaN(expDateNum)) {
        const num = typeof expDateRaw === "number" ? expDateRaw : expDateNum;
        // Check if it's likely seconds (10 digits) or milliseconds
        dateObj = String(num).length > 10 ?
          new Date(num) : new Date(num * 1000);
      } else {
        dateObj = new Date(expDateRaw);
      }
      return isNaN(dateObj.getTime()) ?
        null : dateObj.toISOString().split("T")[0];
    }).filter(Boolean)
  )) as string[];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let contractsToProcess: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchedDates: string[] = [];

  if (date) {
    // SCENARIO 1: Date provided, fetch only that specific date.
    logger.info(`Fetching single chain for specific date: ${date}`);
    const specificResult = await fetchOptionsApi(symbol, date);
    if (specificResult.error || !specificResult.data) {
      return {error: specificResult.error};
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contractsToProcess = specificResult.data.options.flatMap((group: any) =>
      [...group.calls, ...group.puts]);
    fetchedDates = [date];
  } else {
    // SCENARIO 2: No date provided (general query), fetch ALL available chains.
    // This addresses the user's need to find max OI across all dates.
    logger.info(`Fetching ALL available chains for ${symbol}
      across ${allExpirationDates.length} dates.`);

    // Use the fetched dates to generate all chain promises
    const chainPromises = allExpirationDates.map(async (expDate) => {
      const result = await fetchOptionsApi(symbol, expDate) as
        {data: {options: OptionGroup[]}, error: string | null};
      return result.data?.options || [];
    });

    const allOptionsGroups = await Promise.all(chainPromises);

    // Flatten all contracts from all dates
    contractsToProcess =
     allOptionsGroups.flat().flatMap((group: OptionGroup) =>
       [...group.calls, ...group.puts]);
    fetchedDates = allExpirationDates;

    // Truncate contracts for LLM context (Important safety limit)
    const MAX_TOTAL_CONTRACTS = 50;
    if (contractsToProcess.length > MAX_TOTAL_CONTRACTS) {
      logger.warn(`Truncating total contracts from ${contractsToProcess.length}
        to ${MAX_TOTAL_CONTRACTS}.`);
      contractsToProcess = contractsToProcess.slice(0, MAX_TOTAL_CONTRACTS);
    }
  }

  // --- Prepare simplified, combined response for the LLM ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simplifiedContracts = contractsToProcess.map((c: any) => ({
    symbol: c.contractSymbol,
    expirationDate: typeof c.expiration === "number" ?
      new Date(c.expiration * 1000).toISOString().split("T")[0] :
      String(c.expiration),
    strike: c.strike,
    type: c.contractSymbol.includes("C") ? "call" : "put",
    openInterest: c.openInterest,
    volume: c.volume,
    lastPrice: c.lastPrice,
  }));

  // Consolidate the data into a single object for the model
  const modelResponse = {
    underlyingSymbol: symbol,
    underlyingPrice: data.quote?.regularMarketPrice,
    allContracts: simplifiedContracts,
    totalContractsReturned: simplifiedContracts.length,
    datesFetched: fetchedDates,
  };

  return modelResponse;
};

const getFmpData = async ({endpoint}: {endpoint: string}) => {
  logger.info(`AI Tool: Calling getFmpData with endpoint: ${endpoint}`);
  const {data, error} = await fetchFmpApi(endpoint);
  if (error) {
    return {error};
  }

  // Truncate large data arrays (CONTEXT FIX)
  const MAX_ARRAY_LENGTH = 10;
  if (Array.isArray(data) && data.length > MAX_ARRAY_LENGTH) {
    logger.warn(`Truncating FMP response for tool call.
      Original length: ${data.length}`);
    return data.slice(0, MAX_ARRAY_LENGTH);
  }

  return data;
};

// New specific quote fetching function (TOOL CLARITY FIX)
const getFmpQuote = async ({symbol}: {symbol: string}) => {
  logger.info(`AI Tool: Calling getFmpQuote for ${symbol}`);
  const endpoint = `/v3/quote/${symbol.toUpperCase()}`;
  const {data, error} = await fetchFmpApi(endpoint);
  if (error) {
    return {error};
  }
  // Return only the first quote object (for a single symbol query)
  return Array.isArray(data) ? data[0] : data;
};

// New specific news fetching function
const getFmpNews = async ({symbol, limit}: {symbol: string,
  limit?: number}) => {
  logger.info(`AI Tool: Calling getFmpNews for ${symbol}
    with limit ${limit || 20}`);
  const newsLimit = limit || 20;
  const endpoint =
    `/v3/stock_news?tickers=${symbol.toUpperCase()}&limit=${newsLimit}`;
  const {data, error} = await fetchFmpApi(endpoint);
  if (error) {
    return {error};
  }

  if (Array.isArray(data) && data.length > 0) {
    // FIX: Filter out any null or malformed items returned by FMP
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validNews = data.filter((item: any) =>
      item && item.title && item.publishedDate);

    if (validNews.length === 0) {
      return [];
    }

    const MAX_ARTICLES_FOR_LLM = 5; // Limit to 5 articles for context window

    // Return a simplified array of strings for the LLM to easily parse.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return validNews.slice(0, MAX_ARTICLES_FOR_LLM).map( (newsItem: any) => (
      `[${newsItem.publishedDate.split(" ")[0]}] ${newsItem.title}`
    ));
  }

  return [];
};

// New specific analyst ratings function
const getFmpAnalystRatings = async ({symbol}: {symbol: string}) => {
  logger.info(`AI Tool: Calling getFmpAnalystRatings for ${symbol}`);
  const endpoint = `/v3/analyst-stock-recommendations/${symbol.toUpperCase()}`;
  const {data, error} = await fetchFmpApi(endpoint);
  if (error) {
    return {error};
  }

  // Return only the top 5 most recent ratings
  if (Array.isArray(data)) {
    return data.slice(0, 5); // Return the raw 5 items for summary
  }
  return data;
};


const tools: FunctionDeclaration[] = [
  {
    name: "get_options_chain",
    description: `Get the options chain for a stock symbol,
      optionally for a specific expiration date.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {type: Type.STRING, description:
         "The stock ticker symbol (e.g. 'AAPL')"},
        date: {type: Type.STRING, description: `The expiration date in 
          YYYY-MM-DD format. If not provided, the next expiration is used.`},
      },
      required: ["symbol"],
    },
  },
  // Keep generic tool for deeper financial data/endpoints
  {
    name: "get_fmp_data",
    description: `Get comprehensive financial data from 
      FMP using a full API endpoint path
      (e.g., '/v3/balance-sheet-statement/AAPL').
      Use 'get_fmp_quote' for price.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        endpoint: {
          type: Type.STRING,
          description: `The full FMP API endpoint path,
           excluding the base URL and API key.`,
        },
      },
      required: ["endpoint"],
    },
  },
  // New specific quote fetching tool
  {
    name: "get_fmp_quote",
    description: `Get the latest stock price and basic quote
      information for a given symbol.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: "The stock ticker symbol (e.g. 'GOOGL').",
        },
      },
      required: ["symbol"],
    },
  },
  // New news function declaration
  {
    name: "get_fmp_news",
    description: "Get the latest news headlines for a specific stock ticker.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: "The stock ticker symbol (e.g. 'AAPL').",
        },
        limit: {
          type: Type.NUMBER,
          description: `The maximum number of news articles
            to retrieve (default is 10).`,
        },
      },
      required: ["symbol"],
    },
  },
  // Analyst Ratings Tool Declaration
  {
    name: "get_fmp_analyst_ratings",
    description: `Get the latest analyst consensus ratings and
     recommendations for a specific stock ticker.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: "The stock ticker symbol (e.g. 'AAPL').",
        },
      },
      required: ["symbol"],
    },
  },
  // --- START: New Tool Declarations ---
  {
    name: "find_competitors",
    description: `Find a list of competitor or
     peer companies for a given stock symbol.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: "The stock ticker symbol (e.g., 'AAPL').",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_historical_dividends",
    description: `Get the recent historical dividend payment
      amounts and dates for a stock symbol.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: "The stock ticker symbol (e.g., 'MSFT').",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_insider_transactions",
    description: `Get recent insider trading activity (purchases and sales 
    by executives and large shareholders) for a stock symbol.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: "The stock ticker symbol (e.g., 'TSLA').",
        },
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of transactions to return (default 10).",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_sec_filings",
    description: `Get recent SEC filings (like 10-K, 10-Q, 8-K)
     for a stock symbol.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {
          type: Type.STRING,
          description: "The stock ticker symbol (e.g., 'GOOGL').",
        },
        type: {
          type: Type.STRING,
          description: "Optional: Filter by filing type (e.g., '10-K', '8-K').",
        },
        limit: {
          type: Type.NUMBER,
          description: "Maximum number of filings to return (default 5).",
        },
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_market_movers",
    description: `Get the top market movers based on activity type:
      most active stocks ('actives'), top gainers ('gainers'),
       or top losers ('losers').`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          description: `The type of movers to fetch: 'actives',
            'gainers', or 'losers'. Defaults to 'actives'.`,
          enum: ["actives", "gainers", "losers"],
        },
      },
      // No required parameters, defaults to 'actives'
    },
  },
];

// Fetch Competitors using FMP API
const findFmpCompetitors = async ({symbol}: {symbol: string}) => {
  logger.info(`AI Tool: Calling findFmpCompetitors for ${symbol}`);
  // Correct endpoint for stock peers
  const endpoint = `/v4/stock_peers?symbol=${symbol.toUpperCase()}`;
  const {data, error} = await fetchFmpApi(endpoint);
  if (error) {
    return {error};
  }
  // FMP returns an array, the first element
  // contains the symbol and its peers list
  if (Array.isArray(data) && data.length > 0 && data[0].peersList &&
   Array.isArray(data[0].peersList)) {
    // Limit the number of peers returned for context window
    const MAX_PEERS = 10;
    const peers = data[0].peersList;
    logger.info(`Found ${peers.length} peers for ${symbol}.
      Returning top ${Math.min(peers.length, MAX_PEERS)}.`);
    return {symbol: data[0].symbol, peers: peers.slice(0, MAX_PEERS)};
  }
  return {error: `No competitor data found for ${symbol}.`};
};

// Fetch Historical Dividends using FMP API
// eslint-disable-next-line max-len
const getHistoricalDividends = async ({symbol}: {symbol: string}) => {
  logger.info(`AI Tool: Calling getHistoricalDividends for ${symbol}`);
  // Endpoint for historical dividends
  const endpoint = `/v3/historical-price-full/stock_dividend/
  ${symbol.toUpperCase()}`;
  const {data, error} = await fetchFmpApi(endpoint);
  if (error) {
    return {error};
  }
  // The relevant data is usually nested under 'historical'
  if (data && data.historical && Array.isArray(data.historical)) {
    // Return the 5 most recent dividend payouts
    const MAX_DIVIDENDS = 5;
    const dividends = data.historical;
    logger.info(`Found ${dividends.length} historical dividends for ${symbol}.
      Returning most recent ${Math.min(dividends.length, MAX_DIVIDENDS)}.`);
    // Simplify the structure for the AI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return dividends.slice(0, MAX_DIVIDENDS).map((div: any) => ({
      date: div.date,
      dividend: div.dividend,
    }));
  }
  return []; // Return empty array if no historical data found
};

// Fetch Insider Transactions using FMP API
const getInsiderTransactions = async ({symbol, limit = 10}:
  {symbol: string, limit?: number}) => {
  logger.info(`AI Tool: Calling getInsiderTransactions
   for ${symbol} with limit ${limit}`);
  const actualLimit = Math.min(limit || 10, 20); // Keep limit reasonable
  // Endpoint for insider trading
  const endpoint = `/v4/insider-trading?symbol=
    ${symbol.toUpperCase()}&limit=${actualLimit}&page=0`;
  const {data, error} = await fetchFmpApi(endpoint);
  if (error) {
    return {error};
  }
  if (Array.isArray(data)) {
    // Simplify the data for the LLM
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((trade: any) => ({
      date: trade.transactionDate,
      insider: trade.reportingName,
      type: trade.transactionType, // e.g., 'P-Purchase', 'S-Sale'
      shares: trade.securitiesTransacted,
      price: trade.price,
      // Assuming FMP provides this, adjust if needed
      total: trade.totalTransactionAmount,
    }));
  }
  return [];
};

// Fetch SEC Filings using FMP API
// eslint-disable-next-line max-len
const getSecFilings = async ({symbol, type = "", limit = 5}: {symbol: string, type?: string, limit?: number}) => {
  logger.info(`AI Tool: Calling getSecFilings for ${symbol},
   type: ${type}, limit: ${limit}`);
  const actualLimit = Math.min(limit || 5, 10);
  let endpoint = `/v3/sec_filings/${symbol.toUpperCase()}?limit=${actualLimit}`;
  if (type) {
    // Add type if specified (e.g., 10-K, 8-K)
    endpoint += `&type=${type.toUpperCase()}`;
  }
  const {data, error} = await fetchFmpApi(endpoint);
  if (error) {
    return {error};
  }
  if (Array.isArray(data)) {
    // Return key details for the LLM
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((filing: any) => ({
      type: filing.type,
      // Check FMP field name, might be filingDate or fillingDate
      date: filing.fillingDate,
      link: filing.finalLink || filing.link, // Prefer final link
    }));
  }
  return [];
};

// Fetch Market Movers using FMP API
// eslint-disable-next-line max-len
const getMarketMovers = async ({type = "actives"}: {type?: "actives" | "gainers" | "losers"}) => {
  logger.info(`AI Tool: Calling getMarketMovers for type: ${type}`);
  // Construct endpoint based on type
  const endpoint = `/v3/stock_market/${type}`;
  const {data, error} = await fetchFmpApi(endpoint);
  if (error) {
    return {error};
  }
  if (Array.isArray(data)) {
    // Return top 5 movers for brevity
    const MAX_MOVERS = 5;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.slice(0, MAX_MOVERS).map((mover: any) => ({
      symbol: mover.symbol,
      name: mover.name,
      change: mover.change,
      price: mover.price,
      percentChange: mover.changesPercentage,
    }));
  }
  return [];
};

// --- Add to the 'availableTools: {[key: string]: ToolFunction}' map ---
const availableTools: {[key: string]: ToolFunction} = {
  "get_options_chain": getOptionsChain,
  "get_fmp_data": getFmpData,
  "get_fmp_quote": getFmpQuote,
  "get_fmp_news": getFmpNews,
  "get_fmp_analyst_ratings": getFmpAnalystRatings,
  // --- START: Add mappings for new tools ---
  "find_competitors": findFmpCompetitors,
  "get_historical_dividends": getHistoricalDividends,
  "get_insider_transactions": getInsiderTransactions,
  "get_sec_filings": getSecFilings,
  "get_market_movers": getMarketMovers,
  // --- END: Add mappings for new tools ---
};

// --- END: AI TOOLS ---


// --- User Search Logic (omitted for brevity) ---
const queryUsersByField = async (
  usersRef: FirebaseFirestore.CollectionReference,
  field: string,
  query: string,
): Promise<User[]> => {
  const users: User[] = [];
  const endQuery = query + "\uf8ff";
  const snapshot = await usersRef
    .where(field, ">=", query)
    .where(field, "<=", endQuery)
    .limit(10)
    .get();

  snapshot.forEach((doc) => {
    users.push({
      uid: doc.id,
      ...doc.data(),
    } as User);
  });
  return users;
};

const findUsers = async (query: string): Promise<User[]> => {
  logger.info("findUsers function started.", {query});

  try {
    const db = getFirestore();
    const usersRef = db.collection("users");
    logger.info("Got 'users' collection reference.", {
      collectionPath: usersRef.path,
    });

    const displayNameQueries = [
      query,
      query.toLowerCase(),
      query.charAt(0).toUpperCase() + query.slice(1).toLowerCase(),
    ];

    const uniqueDisplayNameQueries = [...new Set(displayNameQueries)];

    const displayNamePromises = uniqueDisplayNameQueries.map((q) =>
      queryUsersByField(usersRef, "displayName", q),
    );
    const emailPromises = [
      queryUsersByField(usersRef, "email", query.toLowerCase()),
    ];

    const results = await Promise.all([...displayNamePromises,
      ...emailPromises]);

    const allUsers = results.flat();

    const uniqueUsers = Array.from(
      new Map(allUsers.map((user) => [user.uid, user])).values(),
    );

    logger.info("Finished processing documents. Returning users.", {
      userCount: uniqueUsers.length,
    });
    return uniqueUsers;
  } catch (error) {
    logger.error("Error within findUsers function:", error);
    throw error;
  }
};


// --- Cloud Functions ---

export const userSearch = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
  },
  async (req: Request, res: Response): Promise<void> => {
    logger.info("userSearch function triggered.", {
      method: req.method,
      query: req.query,
    });

    if (req.method !== "GET") {
      logger.warn("Method Not Allowed:", {method: req.method});
      res.status(405).send("Method Not Allowed");
      return;
    }

    const query = req.query.query as string;
    logger.info("Received search query:", {query});

    if (!query) {
      logger.warn("Missing search query.");
      res.status(400).json({error: "Missing search query."});
      return;
    }

    try {
      logger.info("Calling findUsers function.");
      const users = await findUsers(query);
      logger.info("Successfully found users.", {userCount: users.length});
      res.status(200).json(users);
    } catch (error) {
      logger.error("User Search Error in 'userSearch' function:", error);
      res.status(500).json({error: "Error searching for users."});
    }
  },
);

export const optionsProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
    // CRITICAL FIX: Set 2-minute timeout for slow external API calls
    timeoutSeconds: 120,
  },
  async (req: Request, res: Response): Promise<void> => {
    const symbol = req.query.symbol;
    const date = req.query.date as string | undefined;

    if (!symbol || typeof symbol !== "string") {
      logger.warn("Missing or invalid stock symbol in query.");
      res.status(400).json({error: "Missing or invalid stock symbol."});
      return;
    }

    const {data, error, status} = await fetchOptionsApi(symbol, date);

    if (error) {
      res.status(status).json({error});
      return;
    }

    res.status(status).json(data);
  },
);

export const fmpProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
    timeoutSeconds: 120,
  },
  async (req: Request, res: Response): Promise<void> => {
    const endpoint = req.query.endpoint;
    if (typeof endpoint !== "string") {
      res.status(400).json({error: "Missing endpoint query parameter."});
      return;
    }

    const {data, error, status} = await fetchFmpApi(endpoint);

    if (error) {
      const responseStatus = typeof status === "number" &&
       status >= 100 && status < 600 ? status : 500;
      res.status(responseStatus).json({error});
      return;
    }

    res.status(200).json(data);
  },
);

export const alpacaProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
    // FIX: Add 120s timeout here
    timeoutSeconds: 120,
  },
  async (req: Request, res: Response): Promise<void> => {
    const endpoint = req.query.endpoint;
    if (typeof endpoint !== "string") {
      res.status(400).send("Missing endpoint query parameter.");
      return;
    }

    const url = `https://paper-api.alpaca.markets/v2${endpoint}`;

    try {
      const apiResponse = await fetch(url, {
        method: req.method,
        headers: {
          "APCA-API-KEY-ID": alpacaApiKey.value(),
          "APCA-API-SECRET-KEY": alpacaApiSecret.value(),
          "Content-Type": "application/json",
        },
        body: req.method === "POST" ? JSON.stringify(req.body) : undefined,
      });
      const data = await apiResponse.json();
      res.status(apiResponse.status).send(data);
    } catch (error) {
      logger.error("Alpaca Proxy Error:", error);
      res.status(500).json({error: "Error fetching from Alpaca API."});
    }
  },
);

export const geminiProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
    timeoutSeconds: 120,
  },
  async (req: Request, res: Response): Promise<void> => {
    logger.info("GEMINI_PROXY: Function triggered.");
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const {
        prompt,
        model: modelName = "gemini-2.5-flash",
        enableTools = false,
        responseSchema,
      } = req.body;

      if (!prompt) {
        res.status(400).send("Bad Request: Missing prompt.");
        return;
      }

      const genAI = new GoogleGenAI({apiKey: geminiApiKey.value()});
      const history: Content[] = [{role: "user", parts: [{text: prompt}]}];
      let finalResponseText = "";

      if (enableTools) {
        logger.info("GEMINI_PROXY: Running in ACTOR (tool-enabled) mode.");

        // --- Grounding Integration ---
        const googleSearchTool: Tool = {googleSearch: {}};
        // eslint-disable-next-line max-len
        const groundingKeywords = /^\b(what'?s?|who'?s?|when'?s?|where'?s?|why'?s?|explain|define|how\s+(do|does|is|are))\b/i;
        const requiresGrounding = groundingKeywords.test(prompt);

        const currentTools: Tool[] = [{functionDeclarations: tools}];
        if (requiresGrounding) {
          currentTools.unshift(googleSearchTool);
          logger.info(`GEMINI_PROXY: Enabling Google Search
           grounding for this request.`);
        }
        // --- End Grounding Integration ---

        // --- First Call: Request tool use ---
        const firstResult = await genAI.models.generateContent({
          model: modelName,
          contents: history,
          config: {
            tools: currentTools,
            systemInstruction: `You are an expert financial assistant.
              Your primary task is to use the provided tools to gather
              financial data OR search the web (using the implicit
              Google Search tool when necessary) for explanations/definitions,
              and then synthesize that data into a clear, human-readable summary
              OR a structured JSON object as requested.

              When a user asks for information that requires a tool
              (e.g., stock price, options chains, news, competitors,
              dividends, filings, market movers, definitions), you MUST
              immediately respond with the necessary function call.
              Use the Google Search tool specifically for explaining 
              financial concepts, defining terms, or finding general 
              information not available through other specialized tools 
              (like explaining option strategies).
              Do not ask for confirmation. Your first response in a tool-use
              scenario must be a function call (or rely on
              implicit Google Search if appropriate).

              After the tool provides its output (or after the Google Search
              grounding is complete), your second and final response MUST
              be a concise, human-readable summary
              of the data OR the explanation found.
              **If the Google Search tool was used, clearly present 
              the information found in your summary.** If the search yields
              no relevant results, state that you couldn't find
              the specific information requested.
              If the user asks for a specific format like a JSON object
              for an options strategy, you must provide the data
              in that exact format in your final turn.
              In your final turn, DO NOT output additional
              function calls, code blocks, or conversational filler.`,
          },
        });

        const firstCandidate = firstResult.candidates?.[0];

        if (firstCandidate) {
          const functionCalls = firstCandidate.content?.parts
            ?.map((p) => p.functionCall)
            .filter(Boolean);

          if (functionCalls && functionCalls.length > 0) {
            logger.info(`GEMINI_PROXY: Received 
              ${functionCalls.length} tool call(s).`);

            // --- Execute Tool Calls and Summarize Responses ---
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const toolPromises = functionCalls.map(async (call: any) => {
              if (call.name in availableTools) {
                logger.info(`Executing tool: ${call.name}`, {args: call.args});
                const response = await availableTools[call.name](call.args);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let summarizedResponse: any;
                if (response && response.error) {
                  summarizedResponse = {error: response.error};
                } else if (call.name === "get_fmp_news" &&
                 Array.isArray(response)) {
                  if (response.length === 0) {
                    summarizedResponse = {
                      status: "No news found",
                      symbol: call.args.symbol,
                      message: `The API returned no recent 
                      news articles for this symbol.`,
                    };
                  } else {
                    // News found, fall through to default truncation
                    const responseString = JSON.stringify(response);
                    const MAX_SUMMARY_LENGTH = 1500;
                    summarizedResponse = responseString.length >
                     MAX_SUMMARY_LENGTH ?
                      {truncated_data: responseString.
                        substring(0, MAX_SUMMARY_LENGTH) +
                       "...[TRUNCATED]"} : response;
                  }
                } else if (call.name === "find_competitors" &&
                  typeof response === "object" && response !== null &&
                  "peers" in response && "symbol" in response) {
                  summarizedResponse = {
                    symbol: response.symbol,
                    peer_count: Array.isArray(response.peers) ?
                      response.peers.length : 0,
                    peers: response.peers,
                  };
                } else if (call.name === "get_historical_dividends" &&
                 Array.isArray(response)) {
                  summarizedResponse = {
                    count: response.length,
                    dividends: response,
                  };
                } else if (call.name === "get_insider_transactions" &&
                 Array.isArray(response)) {
                  summarizedResponse = {
                    count: response.length,
                    transactions: response,
                  };
                } else if (call.name === "get_sec_filings" &&
                 Array.isArray(response)) {
                  summarizedResponse = {
                    count: response.length,
                    filings: response,
                  };
                } else if (call.name === "get_market_movers" &&
                 Array.isArray(response)) {
                  summarizedResponse = {
                    count: response.length,
                    movers: response,
                  };
                } else if (call.name === "get_fmp_analyst_ratings" &&
                 Array.isArray(response) && response.length > 0) {
                  const latestRating = response[0];
                  summarizedResponse = {
                    latest_date: latestRating.date,
                    total_buy: (latestRating.analystRatingsBuy || 0) +
                     (latestRating.analystRatingsStrongBuy || 0),
                    hold: (latestRating.analystRatingsHold || 0),
                    total_sell: (latestRating.analystRatingsSell || 0) +
                     (latestRating.analystRatingsStrongSell || 0),
                    num_ratings_sent: response.length,
                  };
                } else if (call.name === "get_fmp_quote" &&
                 typeof response === "object" &&
                 response !== null && "price" in response &&
                  "symbol" in response) {
                  summarizedResponse = {price: response.price,
                    symbol: response.symbol};
                } else if (call.name === "get_options_chain" &&
                 typeof response === "object" && response !== null &&
                  "totalContractsReturned" in response) {
                  summarizedResponse = {
                    status: typeof response.totalContractsReturned ===
                     "number" &&
                     response.totalContractsReturned > 0 ?
                      "Success" : "No contracts found",
                    underlying_symbol: response.underlyingSymbol,
                    underlying_price: response.underlyingPrice,
                    dates_fetched_count: Array.isArray(response.datesFetched) ?
                      response.datesFetched.length : 0,
                    total_contracts_returned: response.totalContractsReturned,
                    allContracts: response.allContracts,
                  };
                } else {
                  // Default truncation for all other successful responses
                  const responseString = JSON.stringify(response);
                  const MAX_SUMMARY_LENGTH = 1500;
                  summarizedResponse = responseString.length >
                   MAX_SUMMARY_LENGTH ?
                    {truncated_data: responseString.
                      substring(0, MAX_SUMMARY_LENGTH) +
                     "...[TRUNCATED]"} : response;
                }

                return {functionResponse: {name: call.name,
                  response: summarizedResponse}};
              }
              // Tool not found
              return {functionResponse: {name: call.name, response:
                {error: `Tool ${call.name} not found.`}}};
            }); // End of toolPromises.map

            const toolResponses = await Promise.all(toolPromises);

            logger.info(`GEMINI_PROXY: Tool responses
             prepared for second call:`, {
              // Log the stringified version
              toolResponsesString: JSON.stringify(toolResponses),
            });

            // --- Second Call: Synthesis Step ---
            // (This logic runs because we removed the skipSynthesis flag)

            const secondCallPrompt = `The previous step involved calling a tool.
            The exact result from that tool is provided in the preceding
            function response part. Your ONLY task is to present this 
            result clearly and concisely to the user. If the tool response
            indicates an error or no data found, state that. Otherwise,
            directly state the information from the tool response.
            Do NOT add any extra analysis, 
            conversational filler, code, or JSON.`;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const secondCallConfig: any = {};
            if (responseSchema) {
              logger.info("GEMINI_PROXY: Overriding second call for schema.");
              secondCallConfig.responseMimeType = "application/json";
              secondCallConfig.responseSchema = responseSchema;
              secondCallConfig.systemInstruction =
              `You are a specialist JSON generator. Your entire output MUST
              be a single raw JSON object that strictly conforms to the
              requested schema. DO NOT include any conversational filler,
              markdown fences (\`\`\`json), or non-JSON text.`;
            }
            // Correctly disable tools for the synthesis call
            secondCallConfig.tools = [];

            const historyWithToolResults: Content[] = [...history];
            if (firstCandidate.content) {
              historyWithToolResults.push(firstCandidate.content);
            }
            historyWithToolResults.push({
              role: "function",
              parts: toolResponses.map((r) =>
                ({functionResponse: r.functionResponse})),
            });
            historyWithToolResults.push({
              role: "user",
              parts: [{text: secondCallPrompt}],
            });

            logger.info(`GEMINI_PROXY: Making SECOND 
              call to Gemini for synthesis.`, {
              modelName,
              config: secondCallConfig,
              historySummary: historyWithToolResults.map((c) => ({
                role: c.role,
                parts: c.parts ? c.parts.map((p) => Object.keys(p)[0]) : [],
              })),
            });

            const secondResult = await genAI.models.generateContent({
              model: modelName,
              contents: historyWithToolResults,
              config: secondCallConfig,
            });

            const secondCandidate = secondResult.candidates?.[0];
            if (secondCandidate) {
              logger.info("GEMINI_PROXY: Received response from SECOND call.", {
                finishReason: secondCandidate.finishReason,
                responseTextPreview: secondCandidate.content?.
                  parts?.[0]?.text?.substring(0, 100) + "...",
              });
              finalResponseText = secondCandidate.content?.parts?.[0]?.text ??
                `Tool executed successfully, but the 
                AI assistant failed to generate a final,
                 human-readable summary (Finish Reason:
                ${secondCandidate.finishReason || "Unknown"}).`;

              if (secondCandidate.finishReason &&
               secondCandidate.finishReason !== "STOP") {
                logger.error(`GEMINI_PROXY: Second call finished unexpectedly!
                Reason: ${secondCandidate.finishReason}`);
                finalResponseText = `I couldn't generate the explanation.
                The request was blocked (Reason:
                 ${secondCandidate.finishReason}).
                This might be due to safety filters or other issues.`;
              }
            } else {
              logger.error(`GEMINI_PROXY: NO candidate found in the
              response from the SECOND call.`);
              finalResponseText = `Tool executed successfully, but the
              AI assistant failed to generate a final response
              (No candidate received).`;
            }
            // --- End of Second Call Logic ---
          } else {
            // No function calls were requested by the model
            finalResponseText = firstCandidate?.content?.parts?.[0]?.text ??
             "No function call was needed, but no text response was returned.";
          }
        } else {
          // No candidate found in the first response
          finalResponseText = "No response candidate found from the model.";
        } // End if (firstCandidate)
      } else { // --- PLANNER MODE (enableTools is false) ---
        logger.info("GEMINI_PROXY: Running in PLANNER (no-tools) mode.");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config: any = {};
        if (responseSchema) {
          config.responseMimeType = "application/json";
          config.responseSchema = responseSchema;
        }
        config.systemInstruction = `You are an expert planner. Your response
          MUST be a single, raw JSON object that conforms exactly
          to the requested schema.
          DO NOT wrap the JSON in Markdown fences (\`\`\`json)
          or conversational text. Output ONLY the JSON.`;

        const result = await genAI.models.generateContent({
          model: modelName,
          contents: history,
          config: config,
        });
        finalResponseText = result.candidates?.[0]?.
          content?.parts?.[0]?.text ?? "{}";
      } // End if (enableTools)

      logger.info("GEMINI_PROXY: Sending final response to client.",
        {text: finalResponseText});
      res.status(200).send({text: finalResponseText});
    } catch (error) {
      logger.error("GEMINI_PROXY: A critical error occurred:", error);
      const errorMessage = error instanceof Error ?
        error.message : "An unknown error occurred.";
      res.status(500).json({error: `Gemini Proxy Error: ${errorMessage}`});
    }
  }, // End async (req, res)
);

const PLAN_QUOTAS = {
  // --- Replace with your ACTUAL Stripe Price IDs ---
  "price_1SLVdmDWUolxMnmeVUnIH9CQ": {signatexMax: 5,
    signatexLite: 50}, // Starter
  "price_1SLVdjDWUolxMnmeiNtApN7C": {signatexMax: 40,
    signatexLite: 500}, // Standard
  "price_1SLVdfDWUolxMnmeJJOS0rD2": {signatexMax: 200,
    signatexLite: 1500}, // Pro
  // ---
  "free": {signatexMax: 0, signatexLite: 20}, // Define free tier limits here
};

/**
 * Updates the user's document in the 'users' collection to reset
 * AI usage quotas based on their subscription role/price ID.
 * Also updates the 'stripeRole' field on the user document.
 * @param {string} userId The ID of the user to update.
 * @param {string | null} newRole The Stripe role determined from
 * the subscription (e.g., 'starter', 'pro', 'free').
 * @param {string | null} newPriceId The Stripe Price ID
 * of the active subscription, or 'free'.
 */
const resetUserUsage = async (userId: string, newRole:
  string | null, newPriceId: string | null) => {
  const userDocRef = getFirestore().collection("users").doc(userId);
  let usageLimits = {};
  // Default to 'free' if role is null/undefined
  const effectiveRole = newRole || "free";
  const effectivePriceId = newPriceId || "free"; // Use 'free' if no price ID

  // Try finding quotas by Price ID first (more specific)
  let planQuota = PLAN_QUOTAS[effectivePriceId as keyof typeof PLAN_QUOTAS];

  if (!planQuota) {
    // If no match by Price ID, try to find by role
    // (less reliable, assumes roles match plan names)
    // This is a fallback, ideally Price IDs should always match.
    logger.warn(`No quota found for priceId "${effectivePriceId}".
     Trying role "${effectiveRole}" as fallback.`);
    // You might need to adjust this logic if your
    // `stripeRole` metadata doesn't directly map to keys in PLAN_QUOTAS
    planQuota = PLAN_QUOTAS[effectiveRole as keyof typeof PLAN_QUOTAS];
  }

  if (planQuota) {
    usageLimits = {
      liteUsed: 0, // Reset used count
      maxUsed: 0, // Reset used count
      // You could store the *limits* too, but useAuth already
      // defines them. Resetting 'used' is key.
      lastUsageReset: FieldValue.serverTimestamp(),
    };
    logger.info(`Found quotas for user ${userId} based on ${newPriceId ?
      "Price ID" : "role"}: ${effectivePriceId}/${effectiveRole}.
       Resetting usage.`);
  } else {
    logger.error(`Could not determine usage quotas for user ${userId}
      with role "${effectiveRole}" and priceId
       "${effectivePriceId}". Usage not reset.`);
    // Optionally, set to free limits as a safety measure?
    // usageLimits = { liteUsed: 0, maxUsed: 0,
    // lastUsageReset: FieldValue.serverTimestamp() };
    // await userDocRef.set({ stripeRole: 'free',
    // ...usageLimits }, { merge: true });
    return; // Exit if no quotas found
  }

  try {
    await userDocRef.set({
      stripeRole: effectiveRole, // Sync the role to the user doc
      ...usageLimits, // Apply the reset usage fields
    }, {merge: true});
    logger.info(`Successfully reset usage counts and
     updated role for user ${userId} to ${effectiveRole}.`);
  } catch (error) {
    logger.error(`Failed to reset usage or update
     role for user ${userId}:`, error);
  }
};

/**
 * Firestore trigger that listens for writes (create, update, delete)
 * to subscription documents and resets user AI usage accordingly.
 */
export const onSubscriptionUpdate = onDocumentWritten(
  "customers/{userId}/subscriptions/{subscriptionId}",
  async (event: FirestoreEvent<Change<DocumentSnapshot> |
    undefined, { userId: string }>) => {
    const userId = event.params.userId;
    logger.info(`Subscription change detected for user ${userId}.`);

    // --- Case 1: Subscription is deleted or ends ---
    // If 'after' doesn't exist, the subscription was deleted.
    // If 'after' exists but status is not active/trialing, it ended.
    const subDataAfter = event.data?.after.data();
    const isActiveAfter = subDataAfter?.status ===
      "active" || subDataAfter?.status === "trialing";

    if (!event.data?.after.exists ||
      (event.data?.after.exists && !isActiveAfter)) {
      // Check if there *was* an active subscription before this change
      const subDataBefore = event.data?.before?.data();
      const isActiveBefore = subDataBefore?.status ===
        "active" || subDataBefore?.status === "trialing";

      // Only revert to free if they were
      // previously active. Avoids unnecessary writes.
      if (isActiveBefore) {
        logger.info(`Subscription ended or deleted for
         user ${userId}. Reverting usage to free tier.`);
        await resetUserUsage(userId, "free",
          "free"); // Use 'free' as the identifier
      } else {
        logger.info(`Subscription document changed but was not active
         before for user ${userId}. No usage reset needed.`);
      }
      return;
      // Stop processing here if the subscription is not active/trialing anymore
    }

    // If we reach here, event.data.after exists
    // and the subscription is 'active' or 'trialing'

    const subDataBefore = event.data?.before?.data();
    const isActiveBefore = subDataBefore?.status === "active" ||
      subDataBefore?.status === "trialing";

    // --- Determine new role and price ID ---
    // The Stripe extension might store role in
    // product metadata OR directly on the sub doc
    // It's safer to primarily rely on the
    // Price ID and map it to your defined quotas.
    const newPriceId = subDataAfter?.items?.[0]?.price?.id ?? null;
    // Extract role as a secondary identifier, default to 'free' if missing
    const newRole = subDataAfter?.role ??
     subDataAfter?.items?.[0]?.price?.product?.metadata?.stripeRole ?? "free";

    // --- Case 2: New subscription activated or plan changed ---
    const previousPriceId = subDataBefore?.items?.[0]?.price?.id ?? null;
    if ((!isActiveBefore && isActiveAfter) ||
      (isActiveAfter && newPriceId !== previousPriceId)) {
      const reason = !isActiveBefore ? "activated" : "changed";
      logger.info(`Subscription ${reason} for user ${userId}.
       Setting quotas for priceId ${newPriceId} / role ${newRole}.`);
      await resetUserUsage(userId, newRole, newPriceId);
      // Don't return yet, renewal check might also apply on change
    }

    // --- Case 3: Subscription renewed (monthly reset) ---
    // Check if the current period end timestamp has
    // changed, indicating a renewal cycle.
    const periodEndBefore = subDataBefore?.current_period_end?.toMillis();
    const periodEndAfter = subDataAfter?.current_period_end?.toMillis();

    // Only reset on renewal if the status is active
    // (don't reset during trial just because period end is set)
    if (subDataAfter?.status === "active" && periodEndBefore !==
      periodEndAfter && periodEndAfter != null) {
      logger.info(`Subscription renewed for user ${userId}. 
        Resetting quotas for priceId ${newPriceId} / role ${newRole}.`);
      // Call resetUserUsage again -
      // it's safe as it just resets the 'used' counts.
      await resetUserUsage(userId, newRole, newPriceId);
    } else if (isActiveAfter && periodEndBefore === periodEndAfter) {
      logger.info(`Subscription update for user 
        ${userId} did not involve renewal or plan change. No usage reset.`);
    }
  }
);
