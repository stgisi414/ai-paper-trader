import {onRequest} from "firebase-functions/v2/https";
import {Request, Response} from "express";
import * as logger from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {defineString} from "firebase-functions/params";
import {GoogleGenAI, GenerationConfig} from "@google/genai";

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

// --- User Search Logic ---

const queryUsersByField = async (
  usersRef: FirebaseFirestore.CollectionReference,
  field: string,
  query: string
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
      queryUsersByField(usersRef, "displayName", q)
    );
    const emailPromises = [
      queryUsersByField(usersRef, "email", query.toLowerCase()),
    ];

    const results = await Promise.all([...displayNamePromises,
      ...emailPromises]);

    const allUsers = results.flat();

    const uniqueUsers = Array.from(
      new Map(allUsers.map((user) => [user.uid, user])).values()
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yfClient: any = null;

const loadYahooFinanceClient = async () => {
  if (yfClient === null) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      yfClient = require("yahoo-finance2").default || require("yahoo-finance2");
    } catch (err) {
      logger.error(
        "Internal Error: Failed to dynamically load options client.",
        err
      );
      throw new Error("Internal Error: Options client initialization failed.");
    }
  }
};

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
  }
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
  }
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
  }
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
  }
);

export const geminiProxy = onRequest(
  {
    invoker: "public",
    cors: true,
    region: "us-central1",
  },
  async (req: Request, res: Response): Promise<void> => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    try {
      const {prompt, model: modelName = "gemini-2.5-flash",
        schema, googleSearch} = req.body;

      if (!prompt) {
        res.status(400).send("Bad Request: Missing prompt.");
        return;
      }

      const genAI = new GoogleGenAI({apiKey: geminiApiKey.value()});

      const generationConfig: GenerationConfig = schema ?
        {
          responseMimeType: "application/json",
          responseSchema: schema,
        } :
        {};

      const requestPayload = {
        model: modelName,
        contents: [{role: "user", parts: [{text: prompt}]}],
        config: generationConfig,
        // Use a spread operator to conditionally add the 'tools' property
        ...(googleSearch && {tools: [{google_search: {}}]}),
      };

      const geminiResult = await genAI.models.generateContent(requestPayload);

      const text = geminiResult.text;
      res.status(200).send({text});
    } catch (error) {
      logger.error("Gemini Proxy Error:", error);
      const errorMessage =
        error instanceof Error ?
          `Error generating content from Gemini API: ${error.message}` :
          "Error generating content from Gemini API.";
      res.status(500).json({error: errorMessage});
    }
  }
);
