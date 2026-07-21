import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

let aiClient: GoogleGenAI | null = null;

function getAiClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please configure it in Settings > Secrets.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// Helper function to generate content with automatic retries and fallback models
async function generateContentWithRetry(ai: GoogleGenAI, options: any) {
  // A comprehensive list of reliable Gemini models.
  // We do exactly 1 attempt per model to fail over instantly and avoid HTTP gateway timeouts!
  const modelsToTry = [
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
    "gemini-2.5-flash"
  ];
  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      console.log(`Attempting content generation using model: ${model}`);
      const response = await ai.models.generateContent({
        ...options,
        model: model,
      });
      return response;
    } catch (error: any) {
      lastError = error;
      const errMessage = error.message || String(error);
      console.warn(`Error with model ${model}:`, errMessage);

      // If it's a client configuration error (e.g., 400 Bad Request, 403 Forbidden, 401 Unauthorized),
      // don't waste time retrying other models because the credentials/arguments are invalid.
      if (errMessage.includes("400") || errMessage.includes("403") || errMessage.includes("401")) {
        throw error;
      }
      // Otherwise, instantly failover to the next model!
    }
  }

  throw lastError || new Error("Không thể kết nối đến máy chủ Gemini do nhu cầu quá cao. Senpai vui lòng thử lại sau giây lát nhen! 💕");
}

// API Routes
app.post("/api/ai/generate-exercise", async (req, res) => {
  try {
    const { topic, vocab, listeningFormat } = req.body;
    if (!topic || !vocab || !Array.isArray(vocab)) {
      return res.status(400).json({ error: "Missing required parameters: topic or vocab." });
    }

    const ai = getAiClient();
    
    const vocabListText = vocab.map((v: any) => `- ${v.word} (${v.partOfSpeech || 'vocab'}): ${v.definition}`).join('\n');

    const formatInstruction = listeningFormat === "monologue"
      ? `The listening script MUST be a long, detailed, and comprehensive monologue, lecture, or narrative speech by a single speaker (e.g., "Professor", "Speaker", "Guide", or "Narrator"). The speech should go into rich detail, offering historical, technical, or descriptive depth about "${topic}". Ensure it incorporates several long paragraphs within the single speaker's voice to create a substantial listening challenge.`
      : `The listening script MUST be written as an engaging, interactive, relatively brief dialogue between 2-3 speakers (e.g., "Teacher", "Yuki", "Hiro") discussing the topic.`;

    const formatExample = listeningFormat === "monologue"
      ? `Professor: Good morning, class. Today, let's explore this topic deeply. We must **prevent** errors and maintain absolute **elegance** in our studies... [continue for several long paragraphs in this manner]`
      : `Teacher: Good morning, class!\nYuki: Hi! Today I **prefer** studying art because of its **elegance**.`;

    const prompt = `Create an English reading passage and an English listening script about the topic: "${topic}".
    You MUST incorporate the following vocabulary words naturally in both the reading passage and the listening script.
    Whenever a vocabulary word is used (including minor tense variations or plurals), you MUST wrap it in markdown bold like **word**.
    
    Here is the list of vocabulary words:
    ${vocabListText}

    ${formatInstruction}

    Please ensure the language level is engaging but accessible (approx. CEFR B1/B2 level).
    The response must strictly follow the JSON schema requested.

    CRITICAL: For the "listening" script field, do NOT output serialized JSON objects or raw code syntax inside the string. It MUST be a standard, beautifully readable dialogue/monologue with plain speaker names, e.g.:
    ${formatExample}
    `;

    const response = await generateContentWithRetry(ai, {
      contents: prompt,
      config: {
        systemInstruction: "You are an expert ESL (English as a Second Language) content creator. You create engaging learning materials (reading passages and listening scripts) centered around specific vocabulary words. Always highlight the targeted vocabulary words using markdown bold format **word**.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reading: {
              type: Type.STRING,
              description: "The reading passage in English. 2-3 paragraphs. Vocab words from the list must be highlighted with **word**."
            },
            listening: {
              type: Type.STRING,
              description: "The listening script in English, written as an interactive dialogue/monologue with speaker names. DO NOT write JSON or code structures. Format strictly as plain text, for example: 'Teacher: Hello class! Today we will learn **elegance**.' on new lines."
            },
            questions: {
              type: Type.ARRAY,
              description: "Exactly 5 comprehension multiple-choice questions in English about the reading or listening passages.",
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING, description: "The multiple choice question." },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Exactly 4 answer choices."
                  },
                  correctIndex: { type: Type.INTEGER, description: "0-based index of the correct answer (0 to 3)." },
                  explanation: { type: Type.STRING, description: "Explanation of why this is correct, written in Vietnamese." }
                },
                required: ["question", "options", "correctIndex", "explanation"]
              }
            }
          },
          required: ["reading", "listening", "questions"]
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini.");
    }

    const exerciseData = JSON.parse(responseText.trim());
    res.json(exerciseData);
  } catch (error: any) {
    console.error("Error generating AI exercise:", error);
    res.status(500).json({ error: error.message || "An error occurred during content generation." });
  }
});

// Serve Frontend using Vite or Static files
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
