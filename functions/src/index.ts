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

const fetchFmpApi = async (endpoint: string) => {
  const apiKey = fmpApiKey.value();
  if (!apiKey) {
    logger.error("FMP_API_KEY is not configured.");
    return { error: "FMP API Key is missing.", status: 500 };
  }
  const queryDelimiter = endpoint.includes("?") ? "&" : "?";
  const url = `https://financialmodelingprep.com/api${endpoint}${queryDelimiter}apikey=${apiKey}`;
  logger.info(`Fetching FMP URL: ${url.replace(apiKey, "REDACTED")}`);
  try {
    const apiResponse = await fetch(url);
    const responseText = await apiResponse.text();
    if (!apiResponse.ok) {
      logger.error(`FMP API Error ${apiResponse.status}:`, responseText);
      return { error: `FMP API Error: ${responseText}`, status: apiResponse.status };
    }
    // Return the parsed data directly on success
    return { data: JSON.parse(responseText), status: 200 };
  } catch (error) {
    logger.error("FMP Fetch Error:", error);
    return { error: "Failed to connect to FMP API.", status: 500 };
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
  logger.info(`Fetching options for ${symbol} on date ${date || "next available"}`);
  try {
    const yfQueryOptions: { date?: Date } = {};
    if (date) {
      // Ensure date is parsed correctly as UTC midnight
      yfQueryOptions.date = new Date(`${date}T00:00:00.000Z`);
    }

    const optionsChain = await yfClient.options(symbol.toUpperCase(), yfQueryOptions);
    if (!optionsChain) {
      const errorMsg = `No options found for ${symbol}`;
      logger.warn(errorMsg);
      return { error: errorMsg, status: 404 };
    }
    return { data: optionsChain, status: 200 };
  } catch (e) {
    const errorMsg = `Failed to fetch options for ${symbol}`;
    logger.error(errorMsg, e);
    return { error: errorMsg, status: 500 };
  }
};

const getOptionsChain = async ({symbol, date}: {symbol: string, date?: string}) => {
  logger.info(`AI Tool: Calling getOptionsChain for ${symbol}`);
  const { data, error } = await fetchOptionsApi(symbol, date);
  if (error) {
    return { error };
  }
  return data;
};

const getFmpData = async ({endpoint}: {endpoint: string}) => {
  logger.info(`AI Tool: Calling getFmpData with endpoint: ${endpoint}`);
  const { data, error } = await fetchFmpApi(endpoint);
  if (error) {
    return { error };
  }
  return data;
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
    const symbol = req.query.symbol;
    const date = req.query.date as string | undefined;

    if (!symbol || typeof symbol !== "string") {
      logger.warn("Missing or invalid stock symbol in query.");
      res.status(400).json({ error: "Missing or invalid stock symbol." });
      return;
    }

    const { data, error, status } = await fetchOptionsApi(symbol, date);

    if (error) {
      res.status(status).json({ error });
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
  },
  async (req: Request, res: Response): Promise<void> => {
    const endpoint = req.query.endpoint;
    if (typeof endpoint !== "string") {
      res.status(400).json({error: "Missing endpoint query parameter."});
      return;
    }

    const { data, error, status } = await fetchFmpApi(endpoint);

    if (error) {
      res.status(status).json({ error });
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
      } = req.body;

      if (!prompt) {
        res.status(400).send("Bad Request: Missing prompt.");
        return;
      }

      const genAI = new GoogleGenAI({apiKey: geminiApiKey.value()});
      const history: Content[] = [{ role: "user", parts: [{ text: prompt }] }];
      let finalResponseText = "";

      if (enableTools) {
        // ACTOR MODE: Use tools to get a final text answer.
        logger.info("GEMINI_PROXY: Running in ACTOR (tool-enabled) mode.");
        
        const config = {
          tools: [{ functionDeclarations: tools }],
        };

        const firstResult = await genAI.models.generateContent({
          model: modelName,
          contents: history,
          ...config,
        });
        
        const firstCandidate = firstResult.candidates?.[0];
        
        // Safely check for a function call.
        const functionCalls = firstCandidate?.content?.parts
            ?.map((p) => p.functionCall)
            .filter(Boolean);

        if (functionCalls && functionCalls.length > 0) {
          logger.info(`GEMINI_PROXY: Received ${functionCalls.length} tool call(s).`);

          const toolPromises = functionCalls.map(async (call: any) => {
            if (call.name in availableTools) {
              logger.info(`Executing tool: ${call.name}`, { args: call.args });
              const response = await availableTools[call.name](call.args);
              return { functionResponse: { name: call.name, response } };
            }
            return { functionResponse: { name: call.name, response: { error: `Tool ${call.name} not found.` } } };
          });

          const toolResponses = await Promise.all(toolPromises);

          const historyWithToolResults: Content[] = [...history];
          // This check is now safe.
          if (firstCandidate.content) {
            historyWithToolResults.push(firstCandidate.content);
          }
          historyWithToolResults.push({ role: "function", parts: toolResponses });
          
          const secondResult = await genAI.models.generateContent({
            model: modelName,
            contents: historyWithToolResults,
            ...config,
          });

          finalResponseText = secondResult.text ?? "Tool executed, but the AI did not provide a final text response.";
        } else {
          // No tool call was suggested, use the initial text response.
          finalResponseText = firstResult.text ?? "No function call was needed, but no text response was returned.";
        }
        
      } else {
        // PLANNER MODE: Generate a JSON workflow without tools.
        logger.info("GEMINI_PROXY: Running in PLANNER (no-tools) mode.");
        const result = await genAI.models.generateContent({
          model: modelName,
          contents: history,
          // Correctly removed generationConfig
        });
        finalResponseText = result.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
      }

      logger.info("GEMINI_PROXY: Sending final response to client.", { text: finalResponseText });
      res.status(200).send({ text: finalResponseText });

    } catch (error) {
      logger.error("GEMINI_PROXY: A critical error occurred:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      res.status(500).json({ error: `Gemini Proxy Error: ${errorMessage}` });
    }
  },
);
