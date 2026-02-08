import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { sign, verify } from "hono/jwt";
import bcrypt from "bcryptjs";

// Types for Cloudflare Workers environment
export interface Env {
    DATABASE_URL: string;
    SESSION_SECRET: string;
    GEMINI_API_KEY: string;
    GITHUB_TOKEN: string;
}

interface AuthPayload {
    userId: string;
    username: string;
    exp: number;
}

// Create Hono app with typed environment
const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use("*", cors());

// ===== Auth Helpers =====
async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
}

async function comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

function signToken(payload: { userId: string; username: string }, secret: string): Promise<string> {
    return sign(
        { ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 20 }, // 20 days
        secret
    );
}

async function verifyToken(token: string, secret: string): Promise<AuthPayload | null> {
    try {
        return (await verify(token, secret)) as AuthPayload;
    } catch {
        return null;
    }
}

// ===== GitHub URL Parser =====
function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
    const cleaned = url.trim().replace(/\/+$/, "");
    const patterns = [
        /^https?:\/\/(www\.)?github\.com\/([^/]+)\/([^/]+)/,
        /^github\.com\/([^/]+)\/([^/]+)$/,
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

// ===== GitHub API Helpers =====
async function fetchFromGitHub(path: string, token: string) {
    const response = await fetch(`https://api.github.com${path}`, {
        headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "RepoInfo-Worker",
        },
    });
    if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`);
    }
    return response.json();
}

async function fetchRepoInfo(owner: string, repo: string, token: string) {
    return fetchFromGitHub(`/repos/${owner}/${repo}`, token);
}

async function fetchRepoTree(owner: string, repo: string, token: string) {
    const data = await fetchFromGitHub(
        `/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
        token
    );
    return data.tree || [];
}

async function fetchLanguages(owner: string, repo: string, token: string) {
    return fetchFromGitHub(`/repos/${owner}/${repo}/languages`, token);
}

async function fetchFileContent(owner: string, repo: string, path: string, token: string) {
    try {
        const data = await fetchFromGitHub(
            `/repos/${owner}/${repo}/contents/${path}`,
            token
        );
        if (data.content) {
            return atob(data.content);
        }
        return null;
    } catch {
        return null;
    }
}

// ===== Gemini AI Helper =====
async function callGemini(prompt: string, apiKey: string) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192,
                },
            }),
        }
    );

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status}`);
    }

    const data = await response.json() as any;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

// ===== Simple In-Memory Storage (for Workers - replace with D1/KV for production) =====
// Note: This is temporary. For production, use Cloudflare D1 or KV
const memoryStorage = {
    users: new Map<string, { id: string; username: string; password: string }>(),
    analyses: new Map<number, any>(),
    analysisCounter: 0,
};

// ===== API Routes =====

// Health check
app.get("/api/health", (c) => c.json({ status: "ok", runtime: "cloudflare-workers" }));

// Auth: Signup
app.post("/api/auth/signup", async (c) => {
    try {
        const { username, password } = await c.req.json();

        if (!username || !password) {
            return c.json({ error: "Username and password are required" }, 400);
        }
        if (username.length < 3) {
            return c.json({ error: "Username must be at least 3 characters" }, 400);
        }
        if (password.length < 6) {
            return c.json({ error: "Password must be at least 6 characters" }, 400);
        }

        // Check if user exists
        for (const user of memoryStorage.users.values()) {
            if (user.username === username) {
                return c.json({ error: "Username already taken" }, 409);
            }
        }

        const hashedPassword = await hashPassword(password);
        const userId = crypto.randomUUID();
        const user = { id: userId, username, password: hashedPassword };
        memoryStorage.users.set(userId, user);

        const token = await signToken({ userId, username }, c.env.SESSION_SECRET);
        return c.json({ token, user: { id: userId, username } });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

// Auth: Signin
app.post("/api/auth/signin", async (c) => {
    try {
        const { username, password } = await c.req.json();

        if (!username || !password) {
            return c.json({ error: "Username and password are required" }, 400);
        }

        let foundUser = null;
        for (const user of memoryStorage.users.values()) {
            if (user.username === username) {
                foundUser = user;
                break;
            }
        }

        if (!foundUser) {
            return c.json({ error: "Invalid username or password" }, 401);
        }

        const valid = await comparePassword(password, foundUser.password);
        if (!valid) {
            return c.json({ error: "Invalid username or password" }, 401);
        }

        const token = await signToken(
            { userId: foundUser.id, username: foundUser.username },
            c.env.SESSION_SECRET
        );
        return c.json({ token, user: { id: foundUser.id, username: foundUser.username } });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

// Auth: Get current user
app.get("/api/auth/me", async (c) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return c.json({ error: "Authentication required" }, 401);
    }

    const token = authHeader.slice(7);
    const payload = await verifyToken(token, c.env.SESSION_SECRET);
    if (!payload) {
        return c.json({ error: "Invalid or expired token" }, 401);
    }

    return c.json({ user: { id: payload.userId, username: payload.username } });
});

// Validate GitHub URL
app.post("/api/validate-url", async (c) => {
    try {
        const { url } = await c.req.json();
        if (!url) {
            return c.json({ valid: false, error: "URL is required" }, 400);
        }

        const parsed = parseGitHubUrl(url);
        if (!parsed) {
            return c.json({
                valid: false,
                error: "Invalid GitHub URL. Please use format: github.com/{username}/{repo}",
            }, 400);
        }

        try {
            const repoInfo = await fetchRepoInfo(parsed.owner, parsed.repo, c.env.GITHUB_TOKEN);
            return c.json({ valid: true, owner: parsed.owner, repo: parsed.repo, repoInfo });
        } catch {
            return c.json({
                valid: false,
                error: `Repository not found: ${parsed.owner}/${parsed.repo}`,
            }, 404);
        }
    } catch (error: any) {
        return c.json({ valid: false, error: error.message }, 500);
    }
});

// Analyze repository (SSE stream)
app.post("/api/analyze", async (c) => {
    const { url } = await c.req.json();

    if (!url) {
        return c.json({ error: "URL is required" }, 400);
    }

    const parsed = parseGitHubUrl(url);
    if (!parsed) {
        return c.json({ error: "Invalid GitHub URL format" }, 400);
    }

    return streamSSE(c, async (stream) => {
        try {
            await stream.writeSSE({ data: JSON.stringify({ step: "info", message: "Fetching repository information..." }) });

            const repoInfo = await fetchRepoInfo(parsed.owner, parsed.repo, c.env.GITHUB_TOKEN);

            await stream.writeSSE({ data: JSON.stringify({ step: "tree", message: "Scanning file structure..." }) });
            const fileTree = await fetchRepoTree(parsed.owner, parsed.repo, c.env.GITHUB_TOKEN);

            await stream.writeSSE({ data: JSON.stringify({ step: "languages", message: "Detecting programming languages..." }) });
            const languages = await fetchLanguages(parsed.owner, parsed.repo, c.env.GITHUB_TOKEN);

            await stream.writeSSE({ data: JSON.stringify({ step: "files", message: `Reading key files...` }) });

            // Fetch a few key files
            const keyFileNames = ["README.md", "package.json", "tsconfig.json", "Cargo.toml", "go.mod", "requirements.txt"];
            const keyFiles: Record<string, string> = {};

            for (const file of fileTree.slice(0, 50)) {
                if (keyFileNames.some(kf => file.path?.endsWith(kf))) {
                    const content = await fetchFileContent(parsed.owner, parsed.repo, file.path, c.env.GITHUB_TOKEN);
                    if (content) {
                        keyFiles[file.path] = content.slice(0, 5000); // Limit content size
                    }
                }
            }

            await stream.writeSSE({ data: JSON.stringify({ step: "analysis", message: "AI is analyzing the codebase architecture..." }) });

            // Build analysis prompt
            const prompt = `Analyze this GitHub repository and provide a structured analysis:

Repository: ${parsed.owner}/${parsed.repo}
Description: ${repoInfo.description || "No description"}
Main Language: ${repoInfo.language || "Unknown"}
Stars: ${repoInfo.stargazers_count}
Forks: ${repoInfo.forks_count}

Languages breakdown: ${JSON.stringify(languages)}

File structure (first 100 files):
${fileTree.slice(0, 100).map((f: any) => f.path).join("\n")}

Key file contents:
${Object.entries(keyFiles).map(([path, content]) => `--- ${path} ---\n${content}`).join("\n\n")}

Provide a JSON response with this structure:
{
  "repoInfo": { "name": "", "owner": "", "description": "", "stars": 0, "forks": 0, "language": "", "url": "" },
  "techStack": { "languages": [{"name": "", "percentage": 0}], "frameworks": [], "libraries": [], "buildTools": [], "testing": [], "deployment": [] },
  "apiEndpoints": [{"method": "", "path": "", "file": "", "group": "", "description": "", "dependencies": []}],
  "frontendBackendFlows": [{"frontendFile": "", "frontendComponent": "", "apiCalls": []}],
  "databaseMapping": { "database": "", "orm": "", "models": [], "services": [] },
  "externalServices": [{"name": "", "type": "", "file": "", "description": ""}],
  "envVariables": [{"name": "", "file": "", "description": "", "required": true}],
  "apiVersioning": [],
  "dependencyGraph": [],
  "contributionSuggestions": [{"title": "", "description": "", "difficulty": "beginner", "files": [], "reason": ""}],
  "readmeArchitecture": "markdown description of architecture",
  "mermaidDiagram": "graph TD; A-->B;"
}

Return ONLY valid JSON, no markdown code blocks.`;

            const analysisText = await callGemini(prompt, c.env.GEMINI_API_KEY);

            // Parse the response
            let analysis;
            try {
                // Try to extract JSON from the response
                const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    analysis = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error("No JSON found in response");
                }
            } catch {
                // Create a basic analysis if parsing fails
                analysis = {
                    repoInfo: {
                        name: parsed.repo,
                        owner: parsed.owner,
                        description: repoInfo.description || "",
                        stars: repoInfo.stargazers_count || 0,
                        forks: repoInfo.forks_count || 0,
                        language: repoInfo.language || "",
                        url: repoInfo.html_url || "",
                    },
                    techStack: { languages: [], frameworks: [], libraries: [], buildTools: [], testing: [], deployment: [] },
                    apiEndpoints: [],
                    frontendBackendFlows: [],
                    databaseMapping: { database: "", orm: "", models: [], services: [] },
                    externalServices: [],
                    envVariables: [],
                    apiVersioning: [],
                    dependencyGraph: [],
                    contributionSuggestions: [],
                    readmeArchitecture: analysisText,
                    mermaidDiagram: "",
                };
            }

            // Save to memory storage
            const id = ++memoryStorage.analysisCounter;
            memoryStorage.analyses.set(id, {
                id,
                repoUrl: url,
                owner: parsed.owner,
                repo: parsed.repo,
                analysisData: analysis,
                createdAt: new Date().toISOString(),
            });

            await stream.writeSSE({
                data: JSON.stringify({
                    step: "complete",
                    message: "Analysis complete!",
                    id,
                    analysis
                })
            });
        } catch (error: any) {
            await stream.writeSSE({
                data: JSON.stringify({ step: "error", message: error.message })
            });
        }
    });
});

// Get analysis by ID
app.get("/api/analysis/:id", async (c) => {
    const id = parseInt(c.req.param("id"));
    const analysis = memoryStorage.analyses.get(id);

    if (!analysis) {
        return c.json({ error: "Analysis not found" }, 404);
    }

    return c.json({ id: analysis.id, analysis: analysis.analysisData });
});

// Generate README
app.post("/api/generate-readme", async (c) => {
    try {
        const { analysis } = await c.req.json();
        if (!analysis) {
            return c.json({ error: "Analysis data is required" }, 400);
        }

        const prompt = `Generate a professional README.md for this repository based on the analysis:
${JSON.stringify(analysis, null, 2)}

Include sections for: Overview, Features, Tech Stack, Installation, Usage, API Documentation, Architecture, Contributing.`;

        const readme = await callGemini(prompt, c.env.GEMINI_API_KEY);
        return c.json({ readme });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

// Generate Mermaid diagram
app.post("/api/generate-mermaid", async (c) => {
    try {
        const { analysis } = await c.req.json();
        if (!analysis) {
            return c.json({ error: "Analysis data is required" }, 400);
        }

        const prompt = `Generate a Mermaid diagram showing the architecture of this repository:
${JSON.stringify(analysis, null, 2)}

Return ONLY the Mermaid diagram code starting with "graph" or "flowchart", no markdown code blocks.`;

        const mermaid = await callGemini(prompt, c.env.GEMINI_API_KEY);
        return c.json({ mermaid });
    } catch (error: any) {
        return c.json({ error: error.message }, 500);
    }
});

// Note: Cloudflare automatically serves static assets from ./dist/public
// API routes are handled above, all other requests go to static assets

export default app;

