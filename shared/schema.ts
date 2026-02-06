import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const analyses = pgTable("analyses", {
  id: serial("id").primaryKey(),
  repoUrl: text("repo_url").notNull(),
  owner: text("owner").notNull(),
  repo: text("repo").notNull(),
  analysisData: jsonb("analysis_data").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertAnalysisSchema = createInsertSchema(analyses).omit({
  id: true,
  createdAt: true,
});

export type InsertAnalysis = z.infer<typeof insertAnalysisSchema>;
export type Analysis = typeof analyses.$inferSelect;

export * from "./models/chat";

export interface ApiEndpoint {
  method: string;
  path: string;
  file: string;
  group: string;
  description: string;
  dependencies: string[];
  parameters?: string[];
  responseType?: string;
}

export interface FrontendBackendFlow {
  frontendFile: string;
  frontendComponent: string;
  apiCalls: { method: string; path: string; purpose: string }[];
}

export interface DatabaseMapping {
  database: string;
  orm: string;
  models: { name: string; table: string; file: string }[];
  services: string[];
}

export interface ExternalService {
  name: string;
  type: string;
  file: string;
  description: string;
}

export interface TechStack {
  languages: { name: string; percentage: number }[];
  frameworks: string[];
  libraries: string[];
  buildTools: string[];
  testing: string[];
  deployment: string[];
}

export interface EnvVariable {
  name: string;
  file: string;
  description: string;
  required: boolean;
}

export interface ApiVersion {
  version: string;
  basePath: string;
  endpoints: number;
}

export interface DependencyEdge {
  source: string;
  target: string;
  type: string;
}

export interface ContributionSuggestion {
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  files: string[];
  reason: string;
}

export interface AnalysisResult {
  repoInfo: {
    name: string;
    owner: string;
    description: string;
    stars: number;
    forks: number;
    language: string;
    url: string;
  };
  techStack: TechStack;
  apiEndpoints: ApiEndpoint[];
  frontendBackendFlows: FrontendBackendFlow[];
  databaseMapping: DatabaseMapping;
  externalServices: ExternalService[];
  envVariables: EnvVariable[];
  apiVersioning: ApiVersion[];
  dependencyGraph: DependencyEdge[];
  contributionSuggestions: ContributionSuggestion[];
  readmeArchitecture: string;
  mermaidDiagram: string;
}
