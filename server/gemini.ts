import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult } from "@shared/schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeRepository(
  repoInfo: AnalysisResult["repoInfo"],
  fileTree: string[],
  keyFiles: { path: string; content: string }[],
  languages: { name: string; percentage: number }[],
): Promise<AnalysisResult> {
  const fileTreeStr = fileTree.join("\n");
  const keyFilesStr = keyFiles
    .map((f) => `--- FILE: ${f.path} ---\n${f.content}\n--- END FILE ---`)
    .join("\n\n");

  const prompt = `You are a senior software architect analyzing a GitHub repository. Analyze the following repository and provide a comprehensive JSON analysis.

REPOSITORY: ${repoInfo.owner}/${repoInfo.name}
DESCRIPTION: ${repoInfo.description}
PRIMARY LANGUAGE: ${repoInfo.language}
LANGUAGES: ${JSON.stringify(languages)}

FILE TREE:
${fileTreeStr}

KEY FILES:
${keyFilesStr}

Provide a detailed JSON analysis with the following structure. Be thorough and accurate based on the actual code:

{
  "techStack": {
    "languages": [{"name": "string", "percentage": number}],
    "frameworks": ["string"],
    "libraries": ["string"],
    "buildTools": ["string"],
    "testing": ["string"],
    "deployment": ["string"]
  },
  "apiEndpoints": [
    {
      "method": "GET|POST|PUT|DELETE|PATCH",
      "path": "/api/...",
      "file": "path/to/file",
      "group": "ServiceName or ControllerName",
      "description": "What this endpoint does",
      "dependencies": ["other endpoints or services it calls"],
      "parameters": ["param1", "param2"],
      "responseType": "JSON object description"
    }
  ],
  "frontendBackendFlows": [
    {
      "frontendFile": "path/to/frontend/file",
      "frontendComponent": "ComponentName",
      "apiCalls": [{"method": "GET", "path": "/api/...", "purpose": "description"}]
    }
  ],
  "databaseMapping": {
    "database": "PostgreSQL|MongoDB|MySQL|SQLite|None",
    "orm": "Drizzle|Prisma|TypeORM|Mongoose|SQLAlchemy|None",
    "models": [{"name": "ModelName", "table": "table_name", "file": "path/to/file"}],
    "services": ["services that interact with DB"]
  },
  "externalServices": [
    {
      "name": "ServiceName",
      "type": "auth|payment|cloud|ai|email|storage|monitoring|other",
      "file": "path/to/file",
      "description": "How it's used"
    }
  ],
  "envVariables": [
    {
      "name": "ENV_VAR_NAME",
      "file": "path/to/file",
      "description": "What it's used for",
      "required": true
    }
  ],
  "apiVersioning": [
    {
      "version": "v1",
      "basePath": "/api/v1",
      "endpoints": 5
    }
  ],
  "dependencyGraph": [
    {
      "source": "/api/endpoint1 or ServiceName",
      "target": "/api/endpoint2 or ExternalService",
      "type": "calls|depends|imports"
    }
  ],
  "contributionSuggestions": [
    {
      "title": "Short title",
      "description": "Detailed description of what to contribute",
      "difficulty": "beginner|intermediate|advanced",
      "files": ["relevant/files"],
      "reason": "Why this is a good contribution"
    }
  ]
}

Rules:
- Only include endpoints, services, and dependencies that you can actually find evidence for in the code
- Group API endpoints by their controller or service module
- For frontendBackendFlows, trace actual API calls from frontend components
- For contributionSuggestions, suggest 3-5 practical areas. Look for: missing tests, documentation gaps, error handling improvements, feature additions based on TODOs/FIXMEs
- If no API versioning is found, return an empty array
- If no database is found, set database to "None"
- Be specific with file paths from the actual file tree
- Return ONLY valid JSON, no markdown formatting`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
    },
  });

  const rawText = response.text || "{}";
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Failed to parse Gemini response as JSON");
    }
  }

  return {
    repoInfo,
    techStack: {
      languages: languages.length > 0 ? languages : parsed.techStack?.languages || [],
      frameworks: parsed.techStack?.frameworks || [],
      libraries: parsed.techStack?.libraries || [],
      buildTools: parsed.techStack?.buildTools || [],
      testing: parsed.techStack?.testing || [],
      deployment: parsed.techStack?.deployment || [],
    },
    apiEndpoints: parsed.apiEndpoints || [],
    frontendBackendFlows: parsed.frontendBackendFlows || [],
    databaseMapping: parsed.databaseMapping || {
      database: "None",
      orm: "None",
      models: [],
      services: [],
    },
    externalServices: parsed.externalServices || [],
    envVariables: parsed.envVariables || [],
    apiVersioning: parsed.apiVersioning || [],
    dependencyGraph: parsed.dependencyGraph || [],
    contributionSuggestions: parsed.contributionSuggestions || [],
    readmeArchitecture: "",
    mermaidDiagram: "",
  };
}

export async function generateReadmeArchitecture(
  analysis: AnalysisResult,
): Promise<string> {
  const prompt = `Based on the following repository analysis, generate a professional README.md "Architecture" section in markdown format. Include:
1. High-level architecture overview
2. Tech stack summary table
3. API endpoints table
4. Database schema overview
5. External integrations
6. Directory structure explanation

Repository: ${analysis.repoInfo.owner}/${analysis.repoInfo.name}
Analysis: ${JSON.stringify(analysis, null, 2)}

Return ONLY the markdown content, starting with ## Architecture`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      maxOutputTokens: 4096,
    },
  });

  return response.text || "";
}

export async function generateMermaidDiagram(
  analysis: AnalysisResult,
): Promise<string> {
  const prompt = `Based on the following repository analysis, generate a Mermaid flowchart diagram showing:
- API endpoints and their relationships
- Frontend components connecting to APIs
- Database connections
- External service integrations

Repository: ${analysis.repoInfo.owner}/${analysis.repoInfo.name}

API Endpoints: ${JSON.stringify(analysis.apiEndpoints)}
Frontend Flows: ${JSON.stringify(analysis.frontendBackendFlows)}
Database: ${JSON.stringify(analysis.databaseMapping)}
External Services: ${JSON.stringify(analysis.externalServices)}
Dependencies: ${JSON.stringify(analysis.dependencyGraph)}

Return ONLY valid Mermaid syntax starting with 'graph TD' or 'flowchart TD'. No markdown code fences.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      maxOutputTokens: 4096,
    },
  });

  return response.text || "graph TD\n  A[No diagram available]";
}
