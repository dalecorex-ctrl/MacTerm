import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const PORT = Number(process.env.PORT || 3000);
const isProd = process.env.NODE_ENV === 'production';

function createAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

interface AgentStepBody {
  goal: string;
  cwd: string;
  persona?: string;
  thinking?: 'low' | 'high';
  history: Array<{ role: 'user' | 'assistant' | 'tool'; content: string }>;
  workspaceFiles: string[];
  attachedFiles?: Array<{ path: string; content: string }>;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.post('/api/agent/step', async (req, res) => {
    const ai = createAiClient();
    if (!ai) {
      res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
      return;
    }

    const body = req.body as AgentStepBody;
    if (!body?.goal) {
      res.status(400).json({ error: 'Missing goal' });
      return;
    }

    const systemInstruction = [
      'You are an autonomous CLI coding agent (like Claude Code, Gemini CLI, and Antigravity CLI) running inside a macOS POSIX terminal (pogs@mac).',
      'Inspect files first, propose surgical edits, verify changes by running commands, and explain clearly.',
      'You must pick exactly ONE tool per step from:',
      '- list_dir: list directory contents. Provide path.',
      '- read_file: read a file. Provide path.',
      '- edit_file: replace an exact snippet inside an existing file. Provide path, oldText, newText.',
      '- write_file: create or completely overwrite a file. Provide path and content.',
      '- search_files: grep/search across files. Provide query and optional path.',
      '- run_command: run a shell command (node, python3, ls, git, grep, cat, etc.). Provide command.',
      '- done: finish the current task and output a concise markdown-free terminal summary in message.',
      'Keep status thoughts crisp (1 sentence) and prefer edit_file for modifying existing files.',
    ].join('\n');

    const attachedText = (body.attachedFiles ?? [])
      .map((f) => `--- Attached @${f.path} ---\n${f.content.slice(0, 4000)}`)
      .join('\n\n');

    const transcript = body.history
      .map((item) => `[${item.role.toUpperCase()}]\n${item.content}`)
      .join('\n\n');

    const prompt = [
      `CLI Persona: ${body.persona ?? 'coder'}`,
      `Current working directory: ${body.cwd}`,
      `Files in cwd: ${body.workspaceFiles.join(', ') || '(empty)'}`,
      attachedText ? `\nReferenced files:\n${attachedText}` : '',
      transcript ? `\nSession history & tool observations:\n${transcript}` : '',
      `\nCurrent user request: ${body.goal}`,
      '\nReturn the next single JSON tool action.',
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction,
          thinkingConfig: {
            thinkingLevel: body.thinking === 'low' ? ThinkingLevel.LOW : ThinkingLevel.HIGH,
          },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              thought: {
                type: Type.STRING,
                description: 'Brief 1-sentence reasoning status for the terminal spinner.',
              },
              tool: {
                type: Type.STRING,
                description: 'One of: list_dir, read_file, edit_file, write_file, search_files, run_command, done',
              },
              path: {
                type: Type.STRING,
                description: 'File or directory path.',
              },
              oldText: {
                type: Type.STRING,
                description: 'Exact existing text to replace when tool is edit_file.',
              },
              newText: {
                type: Type.STRING,
                description: 'Replacement text when tool is edit_file.',
              },
              content: {
                type: Type.STRING,
                description: 'Full file contents when tool is write_file.',
              },
              query: {
                type: Type.STRING,
                description: 'Search pattern when tool is search_files.',
              },
              command: {
                type: Type.STRING,
                description: 'Shell command string when tool is run_command.',
              },
              message: {
                type: Type.STRING,
                description: 'Final concise summary when tool is done.',
              },
            },
            required: ['thought', 'tool'],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText);
      res.json(parsed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Agent inference failed';
      res.status(502).json({ error: msg });
    }
  });

  // Dedicated Android APK download route with strict package-archive MIME type
  app.get('/MacTerm.apk', (_req, res) => {
    const candidates = [
      path.resolve(process.cwd(), 'public', 'MacTerm.apk'),
      path.resolve(process.cwd(), 'dist', 'MacTerm.apk'),
      path.resolve(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    ];
    const found = candidates.find((p) => fs.existsSync(p));
    if (!found) {
      res.status(404).send('APK has not been built yet. Run `npm run build:apk` or the "Build Android APK" GitHub workflow.');
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', 'attachment; filename="MacTerm.apk"');
    res.sendFile(found);
  });

  // Query APK status and metadata
  app.get('/api/apk/status', (_req, res) => {
    const metaPath = path.resolve(process.cwd(), 'public', 'apk-metadata.json');
    const apkPath = path.resolve(process.cwd(), 'public', 'MacTerm.apk');
    if (!fs.existsSync(apkPath)) {
      res.json({ exists: false });
      return;
    }
    const stats = fs.statSync(apkPath);
    let meta: Record<string, unknown> = {};
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      } catch {
        // fallback
      }
    }
    res.json({
      exists: true,
      sizeBytes: stats.size,
      sizeFormatted: `${(stats.size / (1024 * 1024)).toFixed(2)} MB (${(stats.size / 1024).toFixed(1)} KB)`,
      mtime: stats.mtime.toISOString(),
      packageName: 'com.pogsmac.terminal',
      appName: 'Pogs Terminal macOS',
      version: '1.0.0',
      downloadUrl: '/MacTerm.apk',
      ...meta,
    });
  });

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`pogs@mac Terminal server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
