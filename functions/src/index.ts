// functions/src/index.ts
import {onRequest} from "firebase-functions/v2/https";
import {Request, Response} from "express";
import * as logger from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {defineString} from "firebase-functions/params";
import {
  GoogleGenAI,
  FunctionDeclaration,
  Content,
  Type,
} from "@google/genai";

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
  logger.info(`AI Tool: Calling getOptionsChain for ${symbol}`);

  // MODIFICATION: Use type assertion on the destructured variable
  const {data, error} = await fetchOptionsApi(symbol, date) as {data:
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {options: OptionGroup[], expirationDates: any}, error: string | null};
  if (error) {
    return {error};
  }

  // Truncate large options chains before sending to the model (CONTEXT FIX)
  const MAX_CONTRACTS_PER_TYPE = 10;
  // FIX: Use OptionGroup in the map function argument
  if (data && data.options && Array.isArray(data.options)) {
    data.options = data.options.map((optionGroup: OptionGroup) => {
      if (Array.isArray(optionGroup.calls) &&
            optionGroup.calls.length > MAX_CONTRACTS_PER_TYPE) {
        logger.warn(
          `Truncating options response: calls from ${
            optionGroup.calls.length} to ${MAX_CONTRACTS_PER_TYPE}`);
        optionGroup.calls = optionGroup.calls
          .slice(0, MAX_CONTRACTS_PER_TYPE);
      }
      // FIX: Corrected typo from ArrayArray to Array.isArray
      if (Array.isArray(optionGroup.puts) &&
            optionGroup.puts.length > MAX_CONTRACTS_PER_TYPE) {
        logger.warn(
          `Truncating options response: puts from ${
            optionGroup.puts.length} to ${MAX_CONTRACTS_PER_TYPE}`);
        optionGroup.puts = optionGroup.puts
          .slice(0, MAX_CONTRACTS_PER_TYPE);
      }
      return optionGroup;
    });
  }

  return data;
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
  const endpoint = `/v3/stock_news?tickers=${symbol.toUpperCase()}
    &limit=${newsLimit}`;
  const {data, error} = await fetchFmpApi(endpoint);
  if (error) {
    return {error};
  }

  if (Array.isArray(data) && data.length > 0) {
    // FIX: Filter out any null or malformed items returned by FMP 
    // to ensure only valid news objects proceed.
    // We only filter by title and date since we're only sending those.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validNews = data.filter((item: any) => item && item.title && item.publishedDate);

    if (validNews.length === 0) {
      return [];
    }
    
    // CRITICAL FIX: Aggressively limit the payload to the absolute minimum fields
    const MAX_ARTICLES_FOR_LLM = 3; 

    // Return a simplified array with minimal fields (Title, Date).
    // This removes the potentially problematic summarySnippet/text field.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return validNews.slice(0, MAX_ARTICLES_FOR_LLM).map( (newsItem: any) => ({
      publishedDate: newsItem.publishedDate,
      title: newsItem.title,
    }));
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
];


const availableTools: {[key: string]: ToolFunction} = {
  "get_options_chain": getOptionsChain,
  "get_fmp_data": getFmpData,
  "get_fmp_quote": getFmpQuote,
  "get_fmp_news": getFmpNews,
  "get_fmp_analyst_ratings": getFmpAnalystRatings,
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
    // FIX: Add 120s timeout here for other potential long FMP calls
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
      res.status(status).json({error});
      return;
    }

    res.status(status).json(data);
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

        // First call: Request tool use
        const firstResult = await genAI.models.generateContent({
          model: modelName,
          contents: history,
          config: {
            tools: [{functionDeclarations: tools}],
            // CRITICAL FIX: Relax the synthesis constraint to allow lists for news.
            systemInstruction: `You are an expert financial assistant.
             Your task is to immediately proceed w/ the necessary function call
             if the user's request involves fetching data.
             Do not ask for confirmation or offer to use the tool.
             If you use a tool, your first response MUST be a function call.
             Your final, second-turn response MUST be a concise, human-readable summary.
             You may use a list format if appropriate. DO NOT output code blocks,
             JSON, or tool calls in your final turn.`,
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

                  // Check for empty response and provide structured feedback to the model
                  if (response.length === 0) {
                      summarizedResponse = {
                          status: "No news found",
                          symbol: call.args.symbol,
                          message: "The API returned no recent news articles for this symbol."
                      };
                  } else {
                      // CRITICAL FIX: The response array from getFmpNews is already clean.
                      // Just wrap the array under the key 'news_articles' directly.
                      // REMOVE the previous redundant mapping logic here.
                      summarizedResponse = {
                        news_articles: response,
                      };
                  }
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
                } else if (call.name === "get_fmp_quote" && response) {
                  summarizedResponse = {price: response.price,
                    symbol: response.symbol};
                } else if (call.name === "get_options_chain" && response) {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const totalContracts = response.options?.flatMap((o: any) =>
                    [...o.calls, ...o.puts]).length ?? 0;
                  summarizedResponse = {
                    num_contracts: totalContracts,
                    underlying_symbol: call.args.symbol,
                    expiration_dates: response.expirationDates,
                  };
                } else {
                  // Default truncation for generic FMP data
                  const responseString = JSON.stringify(response);
                  const MAX_SUMMARY_LENGTH = 1500;
                  summarizedResponse = responseString.length >
                    MAX_SUMMARY_LENGTH ?
                    {truncated_data: responseString
                      .substring(0, MAX_SUMMARY_LENGTH) + "...[TRUNCATED]"} :
                    response;
                }

                return {functionResponse: {name: call.name,
                  response: summarizedResponse}};
              }
              return {functionResponse: {name: call.name, response:
                {error: `Tool ${call.name} not found.`}}};
            });

            const toolResponses = await Promise.all(toolPromises);

            // Second call: Send tool results and request final text response
            const historyWithToolResults: Content[] = [...history];
            if (firstCandidate.content) {
              historyWithToolResults.push(firstCandidate.content);
            }
            historyWithToolResults.push({
              role: "function",
              parts: toolResponses.map((r) =>
                ({functionResponse: r.functionResponse})),
            });

            // FIX 2: Append a definitive final synthesis command
            historyWithToolResults.push({
              role: "user",
              parts: [{text: `Based on the tool outputs
                provided in the last turn,
                generate the single, requested human-readable summary.
                Do NOT include any code or JSON.`}],
            });


            // NO CONFIG/TOOLS HERE to force plain text output
            const secondResult = await genAI.models.generateContent({
              model: modelName,
              contents: historyWithToolResults,
            });

            finalResponseText = secondResult.candidates?.[0]?.content?.
              parts?.[0]?.text ??
           `Tool executed successfully, but the AI assistant failed
            to generate a final, human-readable summary.`;
          } else {
            // The model decided no function call
            // was needed - return text directly
            finalResponseText = firstCandidate?.content?.parts?.[0]?.text ??
             "No function call was needed, but no text response was returned.";
          }
        } else {
          finalResponseText = "No response candidate found from the model.";
        }
      } else {
        // PLANNER MODE: Generate a JSON output.
        logger.info("GEMINI_PROXY: Running in PLANNER (no-tools) mode.");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config: any = {};
        // Only include the response schema if it was passed
        // by the client (for Planner Mode)
        if (responseSchema) {
          config.responseMimeType = "application/json";
          config.responseSchema = responseSchema;
        }

        // CRITICAL FIX: The instruction for Planner Mode
        // MUST be strong and placed in config
        config.systemInstruction = `You are an expert planner. Your response
          MUST be a single, raw JSON object that conforms exactly
          to the requested schema.
          DO NOT wrap the JSON in Markdown fences (e.g., \`\`\`json)
          or conversational text. Output ONLY the JSON.`;


        const result = await genAI.models.generateContent({
          model: modelName,
          contents: history,
          config: config,
        });
        finalResponseText = result.candidates?.[0]?.
          content?.parts?.[0]?.text ?? "{}";
      }

      logger.info("GEMINI_PROXY: Sending final response to client.",
        {text: finalResponseText});
      res.status(200).send({text: finalResponseText});
    } catch (error) {
      logger.error("GEMINI_PROXY: A critical error occurred:", error);
      const errorMessage = error instanceof Error ?
        error.message : "An unknown error occurred.";
      res.status(500).json({error: `Gemini Proxy Error: ${errorMessage}`});
    }
  },
);
