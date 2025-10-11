import {onRequest} from "firebase-functions/v2/https";
import {Request, Response} from "express";
import * as logger from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {defineString} from "firebase-functions/params";
import {
  GoogleGenAI,
  GenerationConfig,
  FunctionDeclaration,
  Content,
  Type,
} from "@google/genai";


interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

initializeApp();

const fmpApiKey = defineString("FMP_API_KEY");
const alpacaApiKey = defineString("ALPACA_API_KEY");
const alpacaApiSecret = defineString("ALPACA_SECRET_KEY");
const geminiApiKey = defineString("GEMINI_API_KEY");

// --- START: AI TOOLS ---

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

const getOptionsChain = async ({symbol, date}: {symbol: string, date?: string}) => {
  await loadYahooFinanceClient();
  logger.info(`Fetching options for ${symbol} on date ${date}`);
  try {
    const yfQueryOptions: { date?: Date } = {};
    if (date) {
      yfQueryOptions.date = new Date(`${date}T00:00:00.000Z`);
    }
    const optionsChain = await yfClient.options(symbol.toUpperCase(), yfQueryOptions);
    return optionsChain || {error: `No options found for ${symbol}`};
  } catch (e) {
    logger.warn(`Failed to fetch options for ${symbol}/${date || "next"}.`, e);
    return {error: `Failed to fetch options for ${symbol}`};
  }
};

const getFmpData = async ({endpoint}: {endpoint: string}) => {
  logger.info(`Fetching FMP data for endpoint: ${endpoint}`);
  const apiKey = fmpApiKey.value();
  if (!apiKey) {
    return {error: "FMP API Key is missing."};
  }
  const queryDelimiter = endpoint.includes("?") ? "&" : "?";
  const url = `https://financialmodelingprep.com/api${endpoint}${queryDelimiter}apikey=${apiKey}`;
  try {
    const apiResponse = await fetch(url);
    const responseText = await apiResponse.text();
    if (!apiResponse.ok) {
      return {error: `FMP API Error: ${apiResponse.status} ${responseText}`};
    }
    return JSON.parse(responseText);
  } catch (error) {
    logger.error("FMP Proxy Network/Connection Error:", error);
    return {error: "Proxy failed to connect to FMP."};
  }
};

const tools: FunctionDeclaration[] = [
  {
    name: "get_options_chain",
    description: "Get the options chain for a stock symbol, optionally for a specific expiration date.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        symbol: {type: Type.STRING, description: "The stock ticker symbol (e.g. 'AAPL')"},
        date: {type: Type.STRING, description: "The expiration date in YYYY-MM-DD format. If not provided, the next expiration is used."},
      },
      required: ["symbol"],
    },
  },
  {
    name: "get_fmp_data",
    description: "Get financial data from the Financial Modeling Prep API. The endpoint must be a valid FMP API endpoint path (e.g., '/v3/quote/AAPL').",
    parameters: {
      type: Type.OBJECT,
      properties: {
        endpoint: {
          type: Type.STRING,
          description: "The FMP API endpoint path (e.g., '/v3/historical-price-full/AAPL'). See FMP documentation for all options.",
        },
      },
      required: ["endpoint"],
    },
  },
];

const availableTools: { [key: string]: Function } = {
  "get_options_chain": getOptionsChain,
  "get_fmp_data": getFmpData,
};

// --- END: AI TOOLS ---


// --- User Search Logic ---

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
  },
  async (req: Request, res: Response): Promise<void> => {
    await loadYahooFinanceClient();
    try {
      if (req.method !== "GET") {
        logger.warn(`Method Not Allowed: ${req.method}`);
        res.status(405).send("Method Not Allowed");
        return;
      }
      const symbol = req.query.symbol;
      const date = req.query.date as string | undefined;

      if (!symbol || typeof symbol !== "string") {
        logger.warn("Missing or invalid stock symbol in query.");
        res.status(400).json({
          error: "Missing or invalid stock symbol.",
        });
        return;
      }

      const yfQueryOptions: { date?: Date } = {};
      if (date) {
        yfQueryOptions.date = new Date(`${date}T00:00:00.000Z`);
      }

      let optionsChain;

      try {
        // Attempt to fetch options data
        optionsChain = await yfClient.options(symbol.toUpperCase(),
          yfQueryOptions);
      } catch (e) {
        // CRITICAL FIX: Gracefully handle Yahoo Finance failure
        // (e.g., no data for date)
        logger.warn(`Yahoo Finance failed to fetch data for
          ${symbol}/${date || "next"}. Returning empty set.`, e);

        // Construct a minimally valid (empty) response structure
        optionsChain = {
          underlyingSymbol: symbol.toUpperCase(),
          options: [],
          expirationDates: [],
          quote: {
            // Need a price for frontend calculations.
            // Use null or 0 if truly unavailable.
            // For now, we can omit it
            // since the parent try/catch handles the 503.
            // Since we successfully loaded the client,
            // this suggests data is missing, not the service itself.
          },
        };
      }


      res.status(200).json(optionsChain);
    } catch (error) {
      // Keep the general error handler for true internal proxy/server issues
      logger.error("Options Proxy Error (Internal Failure):", error);
      res.status(503).json({
        error: "Failed to fetch options data from external API.",
      });
    }
  },
);


export const fmpProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
  },
  async (req: Request, res: Response): Promise<void> => {
    const endpoint = req.query.endpoint;
    if (typeof endpoint !== "string") {
      res.status(400).json({error: "Missing endpoint query parameter."});
      return;
    }

    const apiKey = fmpApiKey.value();
    if (!apiKey) {
      logger.error("FMP_API_KEY is not configured in Firebase Functions");
      res.status(500).json({error: "FMP API Key is missing."});
      return;
    }

    const queryDelimiter = endpoint.includes("?") ? "&" : "?";
    const url = `https://financialmodelingprep.com/api${endpoint}${queryDelimiter}apikey=${apiKey}`;

    logger.info(`FMP Proxy fetching URL: ${url.replace(apiKey, "REDACTED")}`);

    try {
      const apiResponse = await fetch(url);
      const responseText = await apiResponse.text();

      if (!apiResponse.ok) {
        logger.error(`FMP API status ${apiResponse.status}:`, responseText);
        let errorDetails;
        try {
          errorDetails = JSON.parse(responseText);
        } catch {
          errorDetails = {
            message:
              responseText.slice(0, 200) ||
              `Request failed with status ${apiResponse.status}`,
          };
        }
        res.status(apiResponse.status).json({
          error: "FMP API Error",
          status: apiResponse.status,
          details: errorDetails,
        });
        return;
      }

      try {
        const data = JSON.parse(responseText);
        res.status(200).json(data);
      } catch (e) {
        logger.error("Failed to parse successful response as JSON.", e);
        res.status(500).json({error: "FMP returned unparsable on success."});
      }
    } catch (error) {
      logger.error("FMP Proxy Network/Connection Error:", error);
      res.status(500).json({error: "Proxy failed to connect to FMP."});
    }
  },
);

export const alpacaProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
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
      logger.warn("GEMINI_PROXY: Method Not Allowed:", { method: req.method });
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      logger.info("GEMINI_PROXY: Request body:", req.body);
      const {
        prompt,
        model: modelName = "gemini-2.5-flash",
        schema,
        googleSearch,
        enableTools,
      } = req.body;

      if (!prompt) {
        logger.warn("GEMINI_PROXY: Bad Request - Missing prompt.");
        res.status(400).send("Bad Request: Missing prompt.");
        return;
      }

      logger.info("GEMINI_PROXY: Initializing GoogleGenAI...");
      const genAI = new GoogleGenAI({ apiKey: geminiApiKey.value() });
      logger.info("GEMINI_PROXY: GoogleGenAI initialized successfully.");

      const generationConfig: GenerationConfig = schema ? {
        responseMimeType: "application/json",
        responseSchema: schema,
      } : {};

      const requestPayload: any = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      };

      if (enableTools) {
        requestPayload.tools = [{ functionDeclarations: tools }];
      } else if (googleSearch) {
        requestPayload.tools = [{ google_search: {} }];
      }
      logger.info("GEMINI_PROXY: Constructed request payload:", requestPayload);

      logger.info("GEMINI_PROXY: Sending initial request to Gemini...");
      const geminiResult = await genAI.models.generateContent({
        model: modelName,
        ...requestPayload,
      });
      logger.info("GEMINI_PROXY: Received initial response from Gemini:", JSON.stringify(geminiResult, null, 2));

      const functionCall = geminiResult.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      logger.info("GEMINI_PROXY: Extracted functionCall:", functionCall);

      let rawResponseText = "";
      if (enableTools && functionCall && typeof functionCall.name === "string" && functionCall.name in availableTools) {
        logger.info(`GEMINI_PROXY: Entering tool-calling flow for function: ${functionCall.name}`);
        const apiResult = await availableTools[functionCall.name](functionCall.args);
        logger.info("GEMINI_PROXY: Tool execution result:", apiResult);

        const history: Content[] = [
          ...requestPayload.contents,
          geminiResult.candidates![0].content,
          {
            role: "function",
            parts: [{ functionResponse: { name: functionCall.name, response: apiResult } }],
          },
        ];

        const finalRequestPayload: any = {
          contents: history,
          model: modelName,
          generationConfig,
        };
        logger.info("GEMINI_PROXY: Sending final request to Gemini with tool response:", finalRequestPayload);
        const finalResult = await genAI.models.generateContent(finalRequestPayload);
        rawResponseText = finalResult.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        logger.info("GEMINI_PROXY: Received final response from Gemini:", JSON.stringify(finalResult, null, 2));
       } else {
        logger.info("GEMINI_PROXY: No tool call detected or required. Sending direct response.");
        // This is the line that matters for our test case. It needs to be correct.
        rawResponseText = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      }

      // Handle structured or conversational output consistently
      let responseForFrontend = rawResponseText;
      if (schema) {
        try {
          // FIX: Replace faulty index-based slicing with robust regex stripping and trimming.
          // This removes "```json" from the start, "```" from the end, and trims whitespace.
          const cleanedText = rawResponseText.replace(/^```json\s*|\s*```$/g, '').trim();

          // Attempt to parse the cleaned text to confirm validity before sending.
          JSON.parse(cleanedText);

          responseForFrontend = cleanedText;
          logger.info("GEMINI_PROXY: Successfully extracted and validated JSON.");
        } catch (jsonError) {
          logger.error("GEMINI_PROXY: Error processing JSON from AI. Sending raw text as fallback:", jsonError);
          // If parsing fails, use the original raw text as a fallback.
          responseForFrontend = rawResponseText; 
        }
      }
      
      // Send the cleaned-up string back to the frontend inside a `text` field
      res.status(200).send({ text: responseForFrontend });

    } catch (error) {
      logger.error("GEMINI_PROXY: An error occurred in the proxy:", error);
      const errorMessage =
        error instanceof Error ?
          `Error generating content from Gemini API: ${error.message}` :
          "Error generating content from Gemini API.";
      res.status(500).json({ error: errorMessage });
    }
  },
);
