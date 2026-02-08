import { GoogleGenAI } from "@google/genai";
import type { AnalysisResult } from "@shared/schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

function sanitizeJSON(raw: string): string {
  let text = raw.trim();

  if (text.startsWith("```json")) {
    text = text.slice(7);
  } else if (text.startsWith("```")) {
    text = text.slice(3);
  }
  if (text.endsWith("```")) {
    text = text.slice(0, -3);
  }
  text = text.trim();

  text = text.replace(/,\s*([}\]])/g, "$1");

  return text;
}

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

  let response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      maxOutputTokens: 32768, // Increased limit for larger repos
    },
  });

  // Check if response was truncated and retry with reduced context if needed
  if (response.candidates?.[0]?.finishReason === "MAX_TOKENS" && keyFiles.length > 5) {
    console.log("Response truncated, retrying with fewer files...");
    const reducedKeyFiles = keyFiles.slice(0, Math.ceil(keyFiles.length / 2));
    const reducedKeyFilesStr = reducedKeyFiles
      .map((f) => `--- FILE: ${f.path} ---\n${f.content}\n--- END FILE ---`)
      .join("\n\n");
    
    const reducedPrompt = prompt.replace(
      /KEY FILES:[\s\S]*?Provide a detailed/,
      `KEY FILES:\n${reducedKeyFilesStr}\n\nProvide a detailed`
    );
    
    response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: reducedPrompt,
      config: {
        responseMimeType: "application/json",
        maxOutputTokens: 32768,
      },
    });
  }

  const rawText = response.text || "{}";
  let parsed: any;

  // Check if response is still truncated
  if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    console.warn("Response may be incomplete due to token limit");
  }

  try {
    parsed = JSON.parse(rawText);
  } catch {
    try {
      const sanitized = sanitizeJSON(rawText);
      parsed = JSON.parse(sanitized);
    } catch (innerErr: any) {
      console.error(
        "Failed to parse Gemini JSON. Response length:",
        rawText.length,
        "Finish reason:",
        response.candidates?.[0]?.finishReason,
        "Error:",
        innerErr.message,
      );
      
      // Try to salvage partial response
      const partialMatch = rawText.match(/\{[\s\S]*\}/); 
      if (partialMatch) {
        try {
          parsed = JSON.parse(partialMatch[0]);
          console.log("Successfully recovered partial response");
        } catch {
          throw new Error(
            "The repository is too large for a complete analysis. Try analyzing a smaller repository or specific components.",
          );
        }
      } else {
        throw new Error(
          "The repository is too large for a complete analysis. Try analyzing a smaller repository or specific components.",
        );
      }
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
2. Tech stack summary 
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
      maxOutputTokens: 8192, // Increased for better coverage
    },
  });

  return response.text || "";
}

export async function generateFullReadme(
  analysis: AnalysisResult,
): Promise<string> {
  const prompt = `You are a developer writing a README.md file for a GitHub repository. Based on the following analysis of the repository, generate a complete, professional README.md file.

IMPORTANT RULES:
- Write in simple, clear, everyday language. No overly technical jargon.
- Make it sound natural and human-written, not AI-generated.
- Be specific to this repository - use actual file names, endpoints, and features found in the code.
- Include practical examples where possible.

Repository: ${analysis.repoInfo.owner}/${analysis.repoInfo.name}
Description: ${analysis.repoInfo.description || "No description"}
Primary Language: ${analysis.repoInfo.language}
Stars: ${analysis.repoInfo.stars}

Tech Stack: ${JSON.stringify(analysis.techStack)}
API Endpoints: ${JSON.stringify(analysis.apiEndpoints)}
Database: ${JSON.stringify(analysis.databaseMapping)}
External Services: ${JSON.stringify(analysis.externalServices)}
Environment Variables: ${JSON.stringify(analysis.envVariables)}
Frontend-Backend Flows: ${JSON.stringify(analysis.frontendBackendFlows)}

Generate a README.md with these sections:

# Project Name
Brief, engaging description of what this project does and why it exists.

## Features
List the key features of the project based on the actual code analysis. Be specific.

## Tech Stack
List the technologies, frameworks, and tools used.

## Getting Started

### Prerequisites
What needs to be installed before setting up.

### Installation
Step-by-step instructions to clone and install the project.

### Environment Variables
List required environment variables with descriptions (do NOT include actual values, just descriptions).

### Running the Project
How to start the development server and access the app.

## API Reference
If API endpoints exist, list them in a clear table format with method, path, and description.

## Database Schema
If a database is used, briefly explain the data models.

## Project Structure
Brief overview of the directory layout and what each key folder/file does.

## Contributing
Simple guide for how others can contribute.

## License
A placeholder license section.

Return ONLY the markdown content. Make it complete and ready to use.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      maxOutputTokens: 8192,
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
