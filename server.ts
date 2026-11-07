import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

const app = express();
const port = 3000;

// Allow large audio payload uploads
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));

// Initialize GoogleGenAI SDK
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// API Route: Auto-sync lyrics with Gemini audio understanding
app.post('/api/gemini/sync-lyrics', async (req, res) => {
  try {
    const { audioBase64, mimeType, lines, duration, model } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'GEMINI_API_KEY is not set. Please attach an API key in the Settings > Secrets panel.',
      });
    }

    if (!lines || !Array.isArray(lines) || lines.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No lyric lines provided for synchronization.',
      });
    }

    if (!audioBase64) {
      return res.status(400).json({
        success: false,
        error: 'No song audio provided. Please ensure an audio track is loaded.',
      });
    }

    // Supported model cascade
    const allowedModels = [
      'gemini-3.8-flash',
      'gemini-2.5-flash',
      'gemini-flash-latest',
      'gemini-3.1-flash-lite',
    ];
    const targetModel = allowedModels.includes(model) ? model : 'gemini-3.8-flash';

    const linesListStr = lines
      .map((line: { lineIndex: number; text: string }, idx: number) => `Line ${idx} [Index ${line.lineIndex}]: "${line.text}"`)
      .join('\n');

    const promptText = `You are a professional audio sound engineer and music lyric synchronizer.
Listen with high acoustic precision to the vocal track and singing in the attached audio.
The total duration of the track is approximately ${duration || 35} seconds.

Here are the exact lyric lines, in order, as written by the user:
${linesListStr}

TASK:
Identify the exact start time in seconds (floating point value, e.g. 2.40) where the vocal singing begins for each lyric line in chronological sequence.
- Every line provided must have an estimated start time.
- Start times must be in strictly increasing order (0.0 < startTime <= ${duration || 35}).
- Provide realistic voice onset timestamps matching the melody and vocals in the audio.

Respond with a valid JSON array of objects, one per lyric line in the exact order requested:
[
  { "lineIndex": 0, "startTime": 1.85 },
  { "lineIndex": 1, "startTime": 6.10 }
]`;

    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-zA-Z0-9.-]+;base64,/, '');
    const cleanMime = mimeType || 'audio/wav';

    const response = await ai.models.generateContent({
      model: targetModel,
      contents: [
        {
          inlineData: {
            mimeType: cleanMime,
            data: cleanBase64,
          },
        },
        {
          text: promptText,
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          description: 'List of start times for each lyric line in chronological order.',
          items: {
            type: Type.OBJECT,
            properties: {
              lineIndex: {
                type: Type.INTEGER,
                description: 'The zero-based line index matching the input.',
              },
              startTime: {
                type: Type.NUMBER,
                description: 'The timestamp in seconds when the line begins being sung.',
              },
            },
            required: ['lineIndex', 'startTime'],
          },
        },
      },
    });

    const rawText = response.text || '[]';
    let lineTimings: { lineIndex: number; startTime: number }[] = [];

    try {
      lineTimings = JSON.parse(rawText);
    } catch (parseErr) {
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) {
        lineTimings = JSON.parse(match[0]);
      } else {
        throw new Error('Failed to parse Gemini response as JSON: ' + rawText.slice(0, 100));
      }
    }

    return res.json({
      success: true,
      modelUsed: targetModel,
      lineTimings,
    });
  } catch (err: unknown) {
    console.error('Gemini sync error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown server error during lyric auto-sync';
    const isHighDemand =
      errorMessage.includes('503') ||
      errorMessage.toLowerCase().includes('high demand') ||
      errorMessage.toLowerCase().includes('overloaded') ||
      errorMessage.toLowerCase().includes('unavailable') ||
      errorMessage.toLowerCase().includes('resource_exhausted') ||
      errorMessage.includes('429');

    const statusCode = isHighDemand ? 503 : 500;
    return res.status(statusCode).json({
      success: false,
      isHighDemand,
      error: errorMessage,
    });
  }
});

// Vite middleware mounting in dev mode or static dist in prod
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Glass to Neon Lyrics server running at http://0.0.0.0:${port}`);
  });
}

startServer();
