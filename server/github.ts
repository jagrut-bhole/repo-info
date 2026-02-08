import { Octokit } from "@octokit/rest";

let connectionSettings: any;

async function getAccessToken() {
  // Check if GITHUB_TOKEN is set (for local development)
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  // Otherwise use Replit connector (for Replit deployments)
  if (
    connectionSettings &&
    connectionSettings.settings.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    console.error("[GitHub Auth] No authentication method available");
    throw new Error(
      "GitHub authentication not configured. Please set GITHUB_TOKEN environment variable. Without authentication, GitHub API requests are severely rate-limited (60/hour). Create a token at: https://github.com/settings/tokens"
    );
  }

  connectionSettings = await fetch(
    "https://" +
    hostname +
    "/api/v2/connection?include_secrets=true&connector_names=github",
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    },
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    console.error("[GitHub Auth] Replit connector failed");
    throw new Error("GitHub not connected");
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

export async function fetchRepoInfo(owner: string, repo: string) {
  try {
    const octokit = await getUncachableGitHubClient();
    const { data } = await octokit.repos.get({ owner, repo });
    return {
      name: data.name,
      owner: data.owner.login,
      description: data.description || "",
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language || "Unknown",
      url: data.html_url,
    };
  } catch (error: any) {
    console.error(`[GitHub API] Failed to fetch repo info for ${owner}/${repo}:`, error.message);
    if (error.status === 404) {
      throw new Error(`Repository not found: ${owner}/${repo}. Make sure it exists and is public.`);
    }
    if (error.status === 403 && error.message?.includes('rate limit')) {
      throw new Error('GitHub API rate limit exceeded. Please set a GITHUB_TOKEN environment variable to increase limits from 60 to 5000 requests/hour.');
    }
    throw error;
  }
}

export async function fetchRepoTree(owner: string, repo: string) {
  try {
    const octokit = await getUncachableGitHubClient();
    const { data: refData } = await octokit.git.getRef({
      owner,
      repo,
      ref: "heads/" + (await getDefaultBranch(owner, repo)),
    });

    const { data: treeData } = await octokit.git.getTree({
      owner,
      repo,
      tree_sha: refData.object.sha,
      recursive: "true",
    });

    return treeData.tree
      .filter((item) => item.type === "blob")
      .map((item) => item.path || "")
      .filter(Boolean);
  } catch (error: any) {
    console.error(`[GitHub API] Failed to fetch repo tree for ${owner}/${repo}:`, error.message);
    if (error.status === 403 && error.message?.includes('rate limit')) {
      throw new Error('GitHub API rate limit exceeded. Please set a GITHUB_TOKEN environment variable.');
    }
    throw error;
  }
}

async function getDefaultBranch(owner: string, repo: string): Promise<string> {
  const octokit = await getUncachableGitHubClient();
  const { data } = await octokit.repos.get({ owner, repo });
  return data.default_branch;
}

export async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
): Promise<string> {
  const octokit = await getUncachableGitHubClient();
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    if ("content" in data && data.content) {
      return Buffer.from(data.content, "base64").toString("utf-8");
    }
    return "";
  } catch {
    return "";
  }
}

const KEY_FILE_PATTERNS = [
  "package.json",
  "requirements.txt",
  "Pipfile",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "Gemfile",
  "composer.json",
  ".env.example",
  ".env.sample",
  "docker-compose.yml",
  "Dockerfile",
  "Makefile",
  "README.md",
  "tsconfig.json",
  "vite.config.ts",
  "vite.config.js",
  "webpack.config.js",
  "next.config.js",
  "next.config.ts",
  "nuxt.config.ts",
  "angular.json",
];

const CODE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".php",
  ".cs",
  ".vue",
  ".svelte",
];

const ROUTE_PATTERNS = [
  "route",
  "router",
  "controller",
  "endpoint",
  "api",
  "handler",
  "middleware",
  "server",
  "app",
  "index",
  "main",
  "urls",
  "views",
];

export async function fetchKeyFiles(
  owner: string,
  repo: string,
  allFiles: string[],
): Promise<{ path: string; content: string }[]> {
  const filesToFetch: string[] = [];

  for (const file of allFiles) {
    const fileName = file.split("/").pop() || "";
    const fileLower = file.toLowerCase();

    if (KEY_FILE_PATTERNS.some((p) => fileName === p || fileLower.endsWith(p))) {
      filesToFetch.push(file);
      continue;
    }

    const ext = "." + fileName.split(".").pop();
    if (CODE_EXTENSIONS.includes(ext)) {
      if (
        ROUTE_PATTERNS.some(
          (p) => fileLower.includes(p) || fileName.toLowerCase().includes(p),
        )
      ) {
        filesToFetch.push(file);
        continue;
      }

      if (
        fileLower.includes("page") ||
        fileLower.includes("screen") ||
        fileLower.includes("component") ||
        fileLower.includes("service") ||
        fileLower.includes("model") ||
        fileLower.includes("schema") ||
        fileLower.includes("database") ||
        fileLower.includes("db") ||
        fileLower.includes("auth") ||
        fileLower.includes("config")
      ) {
        filesToFetch.push(file);
      }
    }
  }

  const limitedFiles = filesToFetch.slice(0, 60);

  const results: { path: string; content: string }[] = [];
  const batchSize = 10;

  for (let i = 0; i < limitedFiles.length; i += batchSize) {
    const batch = limitedFiles.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (path) => {
        const content = await fetchFileContent(owner, repo, path);
        const truncated = content.slice(0, 3000);
        return { path, content: truncated };
      }),
    );
    results.push(...batchResults);
  }

  return results;
}

export async function fetchLanguages(
  owner: string,
  repo: string,
): Promise<{ name: string; percentage: number }[]> {
  try {
    const octokit = await getUncachableGitHubClient();
    const { data } = await octokit.repos.listLanguages({ owner, repo });
    const total = Object.values(data).reduce((sum, val) => sum + val, 0);
    return Object.entries(data).map(([name, bytes]) => ({
      name,
      percentage: Math.round((bytes / total) * 100),
    }));
  } catch (error: any) {
    console.error(`[GitHub API] Failed to fetch languages for ${owner}/${repo}:`, error.message);
    if (error.status === 403 && error.message?.includes('rate limit')) {
      throw new Error('GitHub API rate limit exceeded. Please set a GITHUB_TOKEN environment variable.');
    }
    // Return empty array as fallback for languages
    return [];
  }
}
