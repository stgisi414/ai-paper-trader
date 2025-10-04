import {onRequest} from "firebase-functions/v2/https";
import {Request, Response} from "express";
import * as logger from "firebase-functions/logger";
import {initializeApp} from "firebase-admin/app";
import {defineString} from "firebase-functions/params";
import {GoogleGenAI, GenerationConfig} from "@google/genai";

initializeApp();

const fmpApiKey = defineString("FMP_API_KEY");
const alpacaApiKey = defineString("ALPACA_API_KEY");
const alpacaApiSecret = defineString("ALPACA_SECRET_KEY");
const geminiApiKey = defineString("GEMINI_API_KEY");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let yfClient: any = null;

const loadYahooFinanceClient = async () => {
  if (yfClient === null) {
    try {
      /* eslint-disable @typescript-eslint/no-var-requires,
      @typescript-eslint/no-explicit-any */
      yfClient =
        require("yahoo-finance2").default || require("yahoo-finance2");
      /* eslint-enable @typescript-eslint/no-var-requires,
      @typescript-eslint/no-explicit-any */
    } catch (err) {
      logger.error(
        "Internal Error: Failed to dynamically load options client.",
        err,
      );
      throw new Error("Internal Error: Options client initialization failed.");
    }
  }
};

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
      if (!symbol || typeof symbol !== "string") {
        logger.warn("Missing or invalid stock symbol in query.");
        res.status(400).json({
          error: "Missing or invalid stock symbol.",
        });
        return;
      }
      const optionsChain = await yfClient.options(symbol.toUpperCase());
      res.status(200).json(optionsChain);
    } catch (error) {
      logger.error("Yahoo Finance API Error (Internal Failure):", error);
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
      // NEW: Explicitly check for a missing key and log it
      logger.error("FMP_API_KEY is not configured in Firebase Functions");
      res.status(500).json({error: "FMP API Key is missing."});
      return;
    }

    // Check if the endpoint already has a query parameter
    const queryDelimiter = endpoint.includes("?") ? "&" : "?";

    // Build the final FMP URL
    const url = `https://financialmodelingprep.com/api${endpoint}${queryDelimiter}apikey=${apiKey}`;

    // NEW: Log the URL to your Firebase Function logs for verification
    logger.info(`FMP Proxy fetching URL: ${url.replace(apiKey, "REDACTED")}`);

    try {
      const apiResponse = await fetch(url);
      const responseText = await apiResponse.text();

      if (!apiResponse.ok) {
        // Log the error response from FMP
        logger.error(`FMP API status ${apiResponse.status}:`, responseText);

        let errorDetails;
        try {
          // Attempt to parse the error body as JSON (for structured errors)
          errorDetails = JSON.parse(responseText);
        } catch {
          // If it's not JSON (e.g., HTML/plain text error from FMP),
          // capture the beginning
          errorDetails = {message: responseText.slice(0, 200) ||
           `Request failed with status ${apiResponse.status}`};
        }

        // Return a structured error to the client
        res.status(apiResponse.status).json({
          error: "FMP API Error",
          status: apiResponse.status,
          details: errorDetails,
        });
        return;
      }

      // Successful JSON response
      try {
        const data = JSON.parse(responseText);
        res.status(200).json(data);
      } catch (e) {
        logger.error("Failed to parse successful response as JSON.", e);
        res.status(500).json({error: "FMP returned unparsable on success."});
      }
    } catch (error) {
      logger.error("FMP Proxy Network/Connection Error:", error);
      res.status(500).json({error: "Proxy failed to connect to FMP endpoint."});
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
      // FIX Use .json() to ensure the response content-type is application/json
      res.status(500).json({error: "Error fetching from Alpaca API."});
    }
  },
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
      const {prompt, model: modelName = "gemini-2.5-flash", schema} = req.body;

      if (!prompt) {
        res.status(400).send("Bad Request: Missing prompt.");
        return;
      }

      // FIX 1: Initialize with an options object { apiKey: '...' }
      // The Type 'string' has no properties in common with type
      // 'GoogleGenAIOptions' error (TS2559) is fixed here.
      const genAI = new GoogleGenAI({apiKey: geminiApiKey.value()});

      const generationConfig: GenerationConfig = schema ? {
        responseMimeType: "application/json",
        responseSchema: schema,
      } : {};

      // FIX 2: Access generateContent through the models property.
      // The Property 'getGenerativeModel' does not exist on
      // type 'GoogleGenAI' error (TS2339) is fixed here.
      const geminiResult = await genAI.models.generateContent({
        model: modelName,
        contents: [{role: "user", parts: [{text: prompt}]}],
        config: generationConfig,
      });

      const text = geminiResult.text;

      res.status(200).send({text});
    } catch (error) {
      logger.error("Gemini Proxy Error:", error);
      const errorMessage = error instanceof Error ?
        `Error generating content from Gemini API: ${error.message}` :
        "Error generating content from Gemini API.";
      // FIX: Use .json() for a consistent, structured error response
      res.status(500).json({error: errorMessage});
    }
  },
);
