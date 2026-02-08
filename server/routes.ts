import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  fetchRepoInfo,
  fetchRepoTree,
  fetchKeyFiles,
  fetchLanguages,
} from "./github";
import {
  analyzeRepository,
  generateReadmeArchitecture,
  generateFullReadme,
  generateMermaidDiagram,
} from "./gemini";
import type { AnalysisResult } from "@shared/schema";
import {
  authMiddleware,
  optionalAuthMiddleware,
  hashPassword,
  comparePassword,
  signToken,
  verifyToken,
} from "./auth";

function parseGitHubUrl(
  url: string,
): { owner: string; repo: string } | null {
  const cleaned = url.trim().replace(/\/+$/, "");
  const patterns = [
    /^https?:\/\/(www\.)?github\.com\/([^/]+)\/([^/]+)/,
    /^github\.com\/([^/]+)\/([^/]+)/,
    /^([^/]+)\/([^/]+)$/,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const owner = match[match.length - 2];
      const repo = match[match.length - 1].replace(/\.git$/, "");
      if (owner && repo && !owner.includes(".")) {
        return { owner, repo };
      }
    }
  }
  return null;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Health check endpoint
  app.get("/api/health", (req, res) => {
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV || "development",
        hasGithubToken: !!process.env.GITHUB_TOKEN,
        hasGeminiApiKey: !!process.env.GEMINI_API_KEY,
        hasReplitConnector: !!(process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL),
      },
      warnings: [] as string[],
    };

    if (!process.env.GITHUB_TOKEN && !process.env.REPL_IDENTITY && !process.env.WEB_REPL_RENEWAL) {
      health.warnings.push(
        "No GitHub authentication configured. API rate limit is 60 requests/hour. Set GITHUB_TOKEN for 5000 requests/hour."
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      health.warnings.push(
        "GEMINI_API_KEY not configured. Repository analysis will fail."
      );
    }

    res.json(health);
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res
          .status(400)
          .json({ error: "Username and password are required" });
      }
      if (username.length < 3) {
        return res
          .status(400)
          .json({ error: "Username must be at least 3 characters" });
      }
      if (password.length < 6) {
        return res
          .status(400)
          .json({ error: "Password must be at least 6 characters" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ error: "Username already taken" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashedPassword,
      });

      const token = signToken({ userId: user.id, username: user.username });
      return res.json({
        token,
        user: { id: user.id, username: user.username },
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/signin", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res
          .status(400)
          .json({ error: "Username and password are required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const valid = await comparePassword(password, user.password);
      if (!valid) {
        return res.status(401).json({ error: "Invalid username or password" });
      }

      const token = signToken({ userId: user.id, username: user.username });
      return res.json({
        token,
        user: { id: user.id, username: user.username },
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    return res.json({
      user: { id: req.user!.userId, username: req.user!.username },
    });
  });

  app.get("/api/user/analyses", authMiddleware, async (req, res) => {
    try {
      const analyses = await storage.getAnalysesByUser(req.user!.userId);
      return res.json(
        analyses.map((a) => ({
          id: a.id,
          repoUrl: a.repoUrl,
          owner: a.owner,
          repo: a.repo,
          createdAt: a.createdAt,
        })),
      );
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/validate-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ valid: false, error: "URL is required" });
      }

      const parsed = parseGitHubUrl(url);
      if (!parsed) {
        return res.status(400).json({
          valid: false,
          error:
            "Invalid GitHub URL. Please use format: github.com/{username}/{repo}",
        });
      }

      try {
        const repoInfo = await fetchRepoInfo(parsed.owner, parsed.repo);
        return res.json({
          valid: true,
          owner: parsed.owner,
          repo: parsed.repo,
          repoInfo,
        });
      } catch (err: any) {
        return res.status(404).json({
          valid: false,
          error: `Repository not found: ${parsed.owner}/${parsed.repo}`,
        });
      }
    } catch (error: any) {
      return res.status(500).json({ valid: false, error: error.message });
    }
  });

  app.post("/api/analyze", optionalAuthMiddleware, async (req, res) => {
    try {
      const { url, forceRefresh } = req.body;
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({
          error: "Gemini API key is not configured. Please set the GEMINI_API_KEY environment variable.",
        });
      }

      const parsed = parseGitHubUrl(url);
      if (!parsed) {
        return res.status(400).json({
          error:
            "Invalid GitHub URL. Please use format: github.com/{username}/{repo}",
        });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const sendEvent = (data: any) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      try {
        if (!forceRefresh) {
          const cached = await storage.getAnalysisByRepo(
            parsed.owner,
            parsed.repo,
          );
          if (cached) {
            const cachedData = cached.analysisData as AnalysisResult;
            sendEvent({ step: "info", message: "Loading cached analysis..." });
            sendEvent({
              step: "complete",
              message: "Analysis complete!",
              id: cached.id,
              analysis: cachedData,
            });
            return res.end();
          }
        }

        sendEvent({ step: "info", message: "Fetching repository information..." });
        const repoInfo = await fetchRepoInfo(parsed.owner, parsed.repo);

        sendEvent({ step: "tree", message: "Scanning file structure..." });
        const fileTree = await fetchRepoTree(parsed.owner, parsed.repo);

        sendEvent({
          step: "languages",
          message: "Detecting programming languages...",
        });
        const languages = await fetchLanguages(parsed.owner, parsed.repo);

        sendEvent({
          step: "files",
          message: `Reading ${Math.min(fileTree.length, 60)} key files...`,
        });
        const keyFiles = await fetchKeyFiles(parsed.owner, parsed.repo, fileTree);

        sendEvent({
          step: "analysis",
          message: "AI is analyzing the codebase architecture...",
        });
        const analysis = await analyzeRepository(
          repoInfo,
        fileTree,
        keyFiles,
        languages,
      );

      sendEvent({
        step: "saving",
        message: "Saving analysis results...",
      });

      const saved = await storage.createAnalysis({
        repoUrl: url,
        owner: parsed.owner,
        repo: parsed.repo,
        userId: req.user?.userId || null,
        analysisData: analysis,
      });

      sendEvent({
        step: "complete",
        message: "Analysis complete!",
        id: saved.id,
        analysis,
      });

      res.end();
      } catch (innerError: any) {
        console.error("Analysis streaming error:", innerError);
        let userMessage = innerError.message || "An unexpected error occurred";
        if (
          userMessage.includes("JSON") ||
          userMessage.includes("parse") ||
          userMessage.includes("Unexpected token")
        ) {
          userMessage =
            "The AI returned an incomplete response. This can happen with very large repositories. Please try again — results may vary.";
        }
        sendEvent({ step: "error", message: userMessage });
        res.end();
      }
    } catch (error: any) {
      console.error("Analysis error:", error);
      let userMessage = error.message || "An unexpected error occurred";
      if (
        userMessage.includes("JSON") ||
        userMessage.includes("parse") ||
        userMessage.includes("Unexpected token")
      ) {
        userMessage =
          "The AI returned an incomplete response. This can happen with very large repositories. Please try again — results may vary.";
      }
      if (res.headersSent) {
        res.write(
          `data: ${JSON.stringify({ step: "error", message: userMessage })}\n\n`,
        );
        res.end();
      } else {
        res.status(500).json({ error: userMessage });
      }
    }
  });

  app.get("/api/analysis/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const analysis = await storage.getAnalysis(id);
      if (!analysis) {
        return res.status(404).json({ error: "Analysis not found" });
      }
      return res.json({
        id: analysis.id,
        analysis: analysis.analysisData as AnalysisResult,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-readme", async (req, res) => {
    try {
      const { analysis } = req.body;
      if (!analysis) {
        return res.status(400).json({ error: "Analysis data is required" });
      }
      const readme = await generateReadmeArchitecture(analysis);
      return res.json({ readme });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-full-readme", optionalAuthMiddleware, async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "Repository URL is required" });
      }

      const parsed = parseGitHubUrl(url);
      if (!parsed) {
        return res.status(400).json({ error: "Invalid GitHub URL format" });
      }

      const { owner, repo: cleanRepo } = parsed;

      const repoInfo = await fetchRepoInfo(owner, cleanRepo);
      const tree = await fetchRepoTree(owner, cleanRepo);
      const languages = await fetchLanguages(owner, cleanRepo);
      const keyFiles = await fetchKeyFiles(owner, cleanRepo, tree);

      const analysis = await analyzeRepository(repoInfo, tree, keyFiles, languages);
      const readme = await generateFullReadme(analysis);

      return res.json({ readme, analysis });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-mermaid", async (req, res) => {
    try {
      const { analysis } = req.body;
      if (!analysis) {
        return res.status(400).json({ error: "Analysis data is required" });
      }
      const mermaid = await generateMermaidDiagram(analysis);
      return res.json({ mermaid });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
