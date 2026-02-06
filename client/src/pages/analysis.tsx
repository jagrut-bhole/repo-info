import "@xyflow/react/dist/style.css";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearch, useLocation } from "wouter";
import { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, MarkerType, Position } from "@xyflow/react";
import type { Node, Edge } from "@xyflow/react";
import { toPng, toSvg } from "html-to-image";
import jsPDF from "jspdf";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Star,
  GitFork,
  ArrowLeft,
  Download,
  FileImage,
  FileCode,
  FileText,
  Loader2,
  CheckCircle2,
  Circle,
  Server,
  Globe,
  Database,
  Layers,
  Code2,
  Settings,
  Users,
  Lock,
  Unlock,
  ExternalLink,
  FolderTree,
  Network,
  Cpu,
  AlertTriangle,
} from "lucide-react";
import type {
  AnalysisResult,
  ApiEndpoint,
  FrontendBackendFlow,
  DatabaseMapping,
  ExternalService,
  TechStack,
  EnvVariable,
  ApiVersion,
  DependencyEdge,
  ContributionSuggestion,
} from "@shared/schema";

const NODE_COLORS = {
  api: { bg: "hsl(204 88% 53%)", text: "#fff" },
  frontend: { bg: "hsl(160 100% 36%)", text: "#fff" },
  database: { bg: "hsl(42 93% 56%)", text: "#1a1a1a" },
  external: { bg: "hsl(341 75% 51%)", text: "#fff" },
  group: { bg: "hsl(9 75% 61%)", text: "#fff" },
};

const METHOD_COLORS: Record<string, string> = {
  GET: "hsl(160 100% 36%)",
  POST: "hsl(204 88% 53%)",
  PUT: "hsl(42 93% 56%)",
  DELETE: "hsl(356 91% 54%)",
  PATCH: "hsl(280 60% 55%)",
};

const DIFFICULTY_COLORS: Record<string, { bg: string; text: string }> = {
  beginner: { bg: "hsl(160 100% 36% / 0.12)", text: "hsl(160 100% 36%)" },
  intermediate: { bg: "hsl(42 93% 56% / 0.12)", text: "hsl(42 93% 56%)" },
  advanced: { bg: "hsl(9 75% 61% / 0.12)", text: "hsl(9 75% 61%)" },
};

const LANG_COLORS = [
  "hsl(204 88% 53%)",
  "hsl(160 100% 36%)",
  "hsl(42 93% 56%)",
  "hsl(341 75% 51%)",
  "hsl(9 75% 61%)",
  "hsl(280 60% 55%)",
  "hsl(147 79% 42%)",
];

interface AnalysisStep {
  step: string;
  message: string;
  analysis?: AnalysisResult;
  id?: number;
}

function buildFlowElements(analysis: AnalysisResult): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const groupMap = new Map<string, ApiEndpoint[]>();

  analysis.apiEndpoints.forEach((ep) => {
    const group = ep.group || "Other";
    if (!groupMap.has(group)) groupMap.set(group, []);
    groupMap.get(group)!.push(ep);
  });

  let yOffset = 0;
  const xBase = 300;

  groupMap.forEach((endpoints, groupName) => {
    nodes.push({
      id: `group-${groupName}`,
      position: { x: xBase - 40, y: yOffset },
      data: { label: groupName },
      style: {
        background: NODE_COLORS.group.bg,
        color: NODE_COLORS.group.text,
        padding: "8px 16px",
        borderRadius: "8px",
        fontWeight: 600,
        fontSize: "13px",
        border: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
    yOffset += 60;

    endpoints.forEach((ep, i) => {
      const nodeId = `api-${ep.method}-${ep.path}`;
      nodes.push({
        id: nodeId,
        position: { x: xBase, y: yOffset + i * 70 },
        data: { label: `${ep.method} ${ep.path}` },
        style: {
          background: NODE_COLORS.api.bg,
          color: NODE_COLORS.api.text,
          padding: "6px 14px",
          borderRadius: "6px",
          fontSize: "11px",
          fontFamily: "monospace",
          border: "none",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      edges.push({
        id: `edge-group-${groupName}-${nodeId}`,
        source: `group-${groupName}`,
        target: nodeId,
        type: "smoothstep",
        animated: false,
        style: { stroke: NODE_COLORS.group.bg, strokeWidth: 1.5 },
      });
    });
    yOffset += endpoints.length * 70 + 40;
  });

  if (analysis.frontendBackendFlows.length > 0) {
    let fY = 0;
    analysis.frontendBackendFlows.slice(0, 8).forEach((flow, i) => {
      const nodeId = `frontend-${i}`;
      nodes.push({
        id: nodeId,
        position: { x: 0, y: fY },
        data: { label: flow.frontendComponent },
        style: {
          background: NODE_COLORS.frontend.bg,
          color: NODE_COLORS.frontend.text,
          padding: "6px 14px",
          borderRadius: "6px",
          fontSize: "11px",
          border: "none",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });

      flow.apiCalls.forEach((call) => {
        const targetId = `api-${call.method}-${call.path}`;
        const targetExists = nodes.some((n) => n.id === targetId);
        if (targetExists) {
          edges.push({
            id: `edge-fe-${i}-${call.method}-${call.path}`,
            source: nodeId,
            target: targetId,
            type: "smoothstep",
            animated: true,
            style: { stroke: NODE_COLORS.frontend.bg, strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: NODE_COLORS.frontend.bg },
          });
        }
      });
      fY += 80;
    });
  }

  if (analysis.databaseMapping?.models?.length > 0) {
    const dbX = xBase + 350;
    nodes.push({
      id: "database-node",
      position: { x: dbX, y: 0 },
      data: { label: `${analysis.databaseMapping.database || "Database"} (${analysis.databaseMapping.orm || "ORM"})` },
      style: {
        background: NODE_COLORS.database.bg,
        color: NODE_COLORS.database.text,
        padding: "8px 16px",
        borderRadius: "8px",
        fontWeight: 600,
        fontSize: "13px",
        border: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });

    analysis.databaseMapping.models.slice(0, 6).forEach((model, i) => {
      const mId = `model-${i}`;
      nodes.push({
        id: mId,
        position: { x: dbX + 40, y: 60 + i * 60 },
        data: { label: `${model.name} → ${model.table}` },
        style: {
          background: `${NODE_COLORS.database.bg}cc`,
          color: NODE_COLORS.database.text,
          padding: "5px 12px",
          borderRadius: "6px",
          fontSize: "11px",
          border: "none",
          boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
      edges.push({
        id: `edge-db-${mId}`,
        source: "database-node",
        target: mId,
        type: "smoothstep",
        style: { stroke: NODE_COLORS.database.bg, strokeWidth: 1.5 },
      });
    });
  }

  if (analysis.externalServices.length > 0) {
    const extX = xBase + 700;
    analysis.externalServices.slice(0, 6).forEach((svc, i) => {
      const sId = `ext-${i}`;
      nodes.push({
        id: sId,
        position: { x: extX, y: i * 80 },
        data: { label: `${svc.name} (${svc.type})` },
        style: {
          background: NODE_COLORS.external.bg,
          color: NODE_COLORS.external.text,
          padding: "6px 14px",
          borderRadius: "6px",
          fontSize: "11px",
          border: "none",
          boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    });
  }

  analysis.dependencyGraph.forEach((dep, i) => {
    const sourceExists = nodes.some((n) => n.id === dep.source || n.data.label === dep.source);
    const targetExists = nodes.some((n) => n.id === dep.target || n.data.label === dep.target);
    if (sourceExists && targetExists) {
      edges.push({
        id: `dep-edge-${i}`,
        source: dep.source,
        target: dep.target,
        type: "smoothstep",
        style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1, strokeDasharray: "5 5" },
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    }
  });

  return { nodes, edges };
}

function LoadingView({ steps }: { steps: AnalysisStep[] }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="max-w-md w-full px-4">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="w-12 h-12 mx-auto mb-4 rounded-full border-2 border-muted"
            style={{ borderTopColor: "hsl(9 75% 61%)" }}
          />
          <h2 className="text-xl font-semibold mb-1" data-testid="text-loading-title">
            Analyzing Repository
          </h2>
          <p className="text-sm text-muted-foreground">
            This may take a moment...
          </p>
        </motion.div>

        <div className="space-y-3">
          <AnimatePresence>
            {steps.map((step, i) => {
              const isLast = i === steps.length - 1;
              const isComplete = step.step === "complete" || !isLast;
              return (
                <motion.div
                  key={step.step + i}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-3"
                  data-testid={`step-${step.step}`}
                >
                  {isComplete ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "hsl(160 100% 36%)" }} />
                  ) : (
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5 }}
                    >
                      <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: "hsl(9 75% 61%)" }} />
                    </motion.div>
                  )}
                  <span className={`text-sm ${isComplete ? "text-muted-foreground" : ""}`}>
                    {step.message}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function ArchitectureFlowTab({ analysis }: { analysis: AnalysisResult }) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => buildFlowElements(analysis), [analysis]);
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);
  const flowRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        {Object.entries(NODE_COLORS).map(([key, color]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color.bg }} />
            <span className="text-xs text-muted-foreground capitalize">{key === "api" ? "API Endpoints" : key === "group" ? "Groups" : key}</span>
          </div>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          <div ref={flowRef} className="h-[600px] rounded-xl" data-testid="container-architecture-flow">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={16} size={1} />
              <Controls />
              <MiniMap
                nodeStrokeWidth={2}
                pannable
                zoomable
                style={{ borderRadius: "8px", backgroundColor: "hsl(var(--card))" }}
              />
            </ReactFlow>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ApiEndpointsTab({ endpoints }: { endpoints: ApiEndpoint[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, ApiEndpoint[]>();
    endpoints.forEach((ep) => {
      const g = ep.group || "Other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(ep);
    });
    return map;
  }, [endpoints]);

  if (endpoints.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Server className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No API endpoints detected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Accordion type="multiple" defaultValue={Array.from(grouped.keys())} data-testid="accordion-api-endpoints">
      {Array.from(grouped.entries()).map(([group, eps]) => (
        <AccordionItem key={group} value={group}>
          <AccordionTrigger data-testid={`trigger-group-${group}`}>
            <div className="flex items-center gap-2">
              <span className="font-semibold">{group}</span>
              <Badge variant="outline" className="text-[10px]">{eps.length}</Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-2">
              {eps.map((ep, i) => (
                <Card key={`${ep.method}-${ep.path}-${i}`} className="hover-elevate" data-testid={`card-endpoint-${i}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3 flex-wrap">
                      <Badge
                        variant="outline"
                        className="font-mono text-[10px] shrink-0"
                        style={{
                          backgroundColor: `${METHOD_COLORS[ep.method] || "hsl(var(--muted))"}20`,
                          color: METHOD_COLORS[ep.method] || "inherit",
                          borderColor: METHOD_COLORS[ep.method] || "inherit",
                        }}
                      >
                        {ep.method}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <code className="text-sm font-mono">{ep.path}</code>
                        {ep.description && (
                          <p className="text-xs text-muted-foreground mt-1">{ep.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <FolderTree className="w-3 h-3" />
                          {ep.file}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function FrontendBackendTab({ flows }: { flows: FrontendBackendFlow[] }) {
  if (flows.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Network className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No frontend-backend flows detected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3" data-testid="container-frontend-backend">
      {flows.map((flow, i) => (
        <Card key={i} className="hover-elevate" data-testid={`card-flow-${i}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <Code2 className="w-4 h-4 shrink-0" style={{ color: NODE_COLORS.frontend.bg }} />
              <span className="font-semibold text-sm">{flow.frontendComponent}</span>
              <span className="text-xs text-muted-foreground">({flow.frontendFile})</span>
            </div>
            <div className="space-y-1.5 ml-6">
              {flow.apiCalls.map((call, j) => (
                <div key={j} className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono"
                    style={{
                      color: METHOD_COLORS[call.method] || "inherit",
                      borderColor: METHOD_COLORS[call.method] || "inherit",
                    }}
                  >
                    {call.method}
                  </Badge>
                  <code className="text-xs">{call.path}</code>
                  <span className="text-xs text-muted-foreground">{call.purpose}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DatabaseTab({ mapping }: { mapping: DatabaseMapping }) {
  if (!mapping?.models?.length) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Database className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No database mapping detected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="container-database">
      <div className="flex items-center gap-3 flex-wrap">
        {mapping.database && (
          <Badge variant="outline">
            <Database className="w-3 h-3 mr-1" />
            {mapping.database}
          </Badge>
        )}
        {mapping.orm && (
          <Badge variant="outline">
            <Layers className="w-3 h-3 mr-1" />
            {mapping.orm}
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {mapping.models.map((model, i) => (
          <Card key={i} className="hover-elevate" data-testid={`card-model-${i}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${NODE_COLORS.database.bg}20` }}
                >
                  <Database className="w-3.5 h-3.5" style={{ color: NODE_COLORS.database.bg }} />
                </div>
                <span className="font-semibold text-sm">{model.name}</span>
              </div>
              <div className="space-y-1 ml-9">
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  Table: <code className="font-mono">{model.table}</code>
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <FolderTree className="w-3 h-3" /> {model.file}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {mapping.services?.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Connected Services</h4>
          <div className="flex items-center gap-2 flex-wrap">
            {mapping.services.map((svc, i) => (
              <Badge key={i} variant="outline">{svc}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExternalServicesTab({ services }: { services: ExternalService[] }) {
  if (services.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Globe className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No external services detected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="container-external-services">
      {services.map((svc, i) => (
        <Card key={i} className="hover-elevate" data-testid={`card-service-${i}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${NODE_COLORS.external.bg}15` }}
              >
                <Globe className="w-4 h-4" style={{ color: NODE_COLORS.external.bg }} />
              </div>
              <div className="min-w-0">
                <h4 className="font-semibold text-sm">{svc.name}</h4>
                <Badge variant="outline" className="text-[10px] mt-0.5">{svc.type}</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{svc.description}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <FolderTree className="w-3 h-3" /> {svc.file}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function TechStackTab({ stack }: { stack: TechStack }) {
  return (
    <div className="space-y-6" data-testid="container-tech-stack">
      {stack.languages?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Languages</h3>
          <div className="space-y-2">
            {stack.languages.map((lang, i) => (
              <div key={lang.name} className="flex items-center gap-3">
                <span className="text-sm w-24 shrink-0">{lang.name}</span>
                <div className="flex-1">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${lang.percentage}%` }}
                      transition={{ duration: 0.8, delay: i * 0.1 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: LANG_COLORS[i % LANG_COLORS.length] }}
                    />
                  </div>
                </div>
                <span className="text-xs text-muted-foreground w-12 text-right">{lang.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {stack.frameworks?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Frameworks</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {stack.frameworks.map((fw) => (
                  <Badge key={fw} variant="outline">{fw}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {stack.libraries?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Libraries</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {stack.libraries.map((lib) => (
                  <Badge key={lib} variant="outline">{lib}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {stack.buildTools?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Build Tools</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {stack.buildTools.map((t) => (
                  <Badge key={t} variant="outline">{t}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {stack.testing?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Testing</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {stack.testing.map((t) => (
                  <Badge key={t} variant="outline">{t}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {stack.deployment?.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Deployment</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1.5">
                {stack.deployment.map((d) => (
                  <Badge key={d} variant="outline">{d}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function EnvVariablesTab({ variables }: { variables: EnvVariable[] }) {
  if (variables.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Settings className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No environment variables detected</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2" data-testid="container-env-vars">
      {variables.map((v, i) => (
        <Card key={i} className="hover-elevate" data-testid={`card-env-${i}`}>
          <CardContent className="p-3">
            <div className="flex items-start gap-3">
              {v.required ? (
                <Lock className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "hsl(9 75% 61%)" }} />
              ) : (
                <Unlock className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-mono font-semibold">{v.name}</code>
                  {v.required && (
                    <Badge variant="outline" className="text-[10px]" style={{ color: "hsl(9 75% 61%)", borderColor: "hsl(9 75% 61% / 0.3)" }}>
                      Required
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <FolderTree className="w-3 h-3" /> {v.file}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ContributingTab({ suggestions }: { suggestions: ContributionSuggestion[] }) {
  if (suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Users className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">No contribution suggestions available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="container-contributing">
      {suggestions.map((sug, i) => {
        const colors = DIFFICULTY_COLORS[sug.difficulty] || DIFFICULTY_COLORS.beginner;
        return (
          <Card key={i} className="hover-elevate" data-testid={`card-contribution-${i}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                  style={{ backgroundColor: colors.bg }}
                >
                  <Users className="w-4 h-4" style={{ color: colors.text }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h4 className="font-semibold text-sm">{sug.title}</h4>
                    <Badge
                      variant="outline"
                      className="text-[10px] capitalize"
                      style={{ color: colors.text, borderColor: `${colors.text}40` }}
                    >
                      {sug.difficulty}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{sug.description}</p>
                  {sug.files?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {sug.files.map((f, j) => (
                        <Badge key={j} variant="outline" className="text-[10px] font-mono">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {sug.reason && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{sug.reason}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function AnalysisPage() {
  const search = useSearch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { token } = useAuth();

  const params = new URLSearchParams(search);
  const encodedUrl = params.get("url");
  const decodedUrl = encodedUrl ? decodeURIComponent(encodedUrl) : "";
  const analysisId = params.get("id");

  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [steps, setSteps] = useState<AnalysisStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [exportLoading, setExportLoading] = useState<string | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!analysisId || hasStarted.current) return;
    hasStarted.current = true;

    const loadById = async () => {
      try {
        const res = await fetch(`/api/analysis/${analysisId}`);
        if (!res.ok) throw new Error("Analysis not found");
        const data = await res.json();
        setAnalysis(data.analysis);
        setIsLoading(false);
      } catch (err: any) {
        setError(err.message || "Failed to load analysis");
        setIsLoading(false);
      }
    };
    loadById();
  }, [analysisId]);

  const runAnalysis = useCallback(async () => {
    if (!decodedUrl || hasStarted.current || analysisId) return;
    hasStarted.current = true;

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: decodedUrl }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || `Analysis failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming not supported");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          const lines = part.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data: AnalysisStep = JSON.parse(line.slice(6));
                setSteps((prev) => [...prev, data]);

                if (data.step === "error") {
                  setError(data.message || "Analysis failed");
                  setIsLoading(false);
                  return;
                }
                if (data.step === "complete" && data.analysis) {
                  setAnalysis(data.analysis);
                  setIsLoading(false);
                }
              } catch {
                // skip malformed JSON
              }
            }
          }
        }
      }

      if (!analysis) {
        if (buffer.trim()) {
          const lines = buffer.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data: AnalysisStep = JSON.parse(line.slice(6));
                if (data.step === "complete" && data.analysis) {
                  setAnalysis(data.analysis);
                  setIsLoading(false);
                }
              } catch {
                // skip
              }
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || "Analysis failed");
      setIsLoading(false);
      toast({
        title: "Analysis Error",
        description: err.message || "Failed to analyze repository",
        variant: "destructive",
      });
    }
  }, [decodedUrl, analysisId, token, toast]);

  useEffect(() => {
    if (!analysisId) {
      runAnalysis();
    }
  }, [runAnalysis, analysisId]);

  const getFlowElement = useCallback(() => {
    return document.querySelector('[data-testid="container-architecture-flow"]') as HTMLElement | null;
  }, []);

  const handleExportPng = useCallback(async () => {
    const flowEl = getFlowElement();
    if (!flowEl) return;
    setExportLoading("png");
    try {
      const dataUrl = await toPng(flowEl, { quality: 0.95, backgroundColor: "#1a1a2e" });
      const link = document.createElement("a");
      link.download = `architecture-${analysis?.repoInfo?.name || "diagram"}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Exported", description: "PNG downloaded successfully" });
    } catch {
      toast({ title: "Export Failed", description: "Could not export as PNG", variant: "destructive" });
    }
    setExportLoading(null);
  }, [analysis, toast, getFlowElement]);

  const handleExportSvg = useCallback(async () => {
    const flowEl = getFlowElement();
    if (!flowEl) return;
    setExportLoading("svg");
    try {
      const dataUrl = await toSvg(flowEl, { backgroundColor: "#1a1a2e" });
      const link = document.createElement("a");
      link.download = `architecture-${analysis?.repoInfo?.name || "diagram"}.svg`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Exported", description: "SVG downloaded successfully" });
    } catch {
      toast({ title: "Export Failed", description: "Could not export as SVG", variant: "destructive" });
    }
    setExportLoading(null);
  }, [analysis, toast, getFlowElement]);

  const handleExportPdf = useCallback(async () => {
    const flowEl = getFlowElement();
    if (!flowEl) return;
    setExportLoading("pdf");
    try {
      const dataUrl = await toPng(flowEl, { quality: 0.9, backgroundColor: "#1a1a2e" });
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => { img.onload = resolve; });
      const pdf = new jsPDF({ orientation: img.width > img.height ? "landscape" : "portrait", unit: "px", format: [img.width, img.height] });
      pdf.addImage(dataUrl, "PNG", 0, 0, img.width, img.height);
      pdf.save(`architecture-${analysis?.repoInfo?.name || "diagram"}.pdf`);
      toast({ title: "Exported", description: "PDF downloaded successfully" });
    } catch {
      toast({ title: "Export Failed", description: "Could not export as PDF", variant: "destructive" });
    }
    setExportLoading(null);
  }, [analysis, toast, getFlowElement]);

  const handleGenerateReadme = useCallback(async () => {
    if (!analysis) return;
    setExportLoading("readme");
    try {
      const res = await apiRequest("POST", "/api/generate-readme", { analysis });
      const data = await res.json();
      const blob = new Blob([data.readme || ""], { type: "text/markdown" });
      const link = document.createElement("a");
      link.download = "ARCHITECTURE.md";
      link.href = URL.createObjectURL(blob);
      link.click();
      toast({ title: "Generated", description: "README architecture section downloaded" });
    } catch {
      toast({ title: "Generation Failed", description: "Could not generate README section", variant: "destructive" });
    }
    setExportLoading(null);
  }, [analysis, toast]);

  const handleGenerateMermaid = useCallback(async () => {
    if (!analysis) return;
    setExportLoading("mermaid");
    try {
      const res = await apiRequest("POST", "/api/generate-mermaid", { analysis });
      const data = await res.json();
      const blob = new Blob([data.mermaid || ""], { type: "text/plain" });
      const link = document.createElement("a");
      link.download = "architecture.mmd";
      link.href = URL.createObjectURL(blob);
      link.click();
      toast({ title: "Generated", description: "Mermaid diagram downloaded" });
    } catch {
      toast({ title: "Generation Failed", description: "Could not generate Mermaid diagram", variant: "destructive" });
    }
    setExportLoading(null);
  }, [analysis, toast]);

  if (!decodedUrl && !analysisId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">No Repository URL</h2>
            <p className="text-sm text-muted-foreground mb-4">Please provide a repository URL to analyze.</p>
            <Button onClick={() => setLocation("/")} data-testid="button-go-home">
              <ArrowLeft className="w-4 h-4" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-4" style={{ color: "hsl(9 75% 61%)" }} />
            <h2 className="text-lg font-semibold mb-2">Analysis Failed</h2>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4" />
                Home
              </Button>
              <Button onClick={() => { hasStarted.current = false; setError(null); setSteps([]); setIsLoading(true); runAnalysis(); }} data-testid="button-retry">
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return <LoadingView steps={steps} />;
  }

  if (!analysis) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">No Results</h2>
            <p className="text-sm text-muted-foreground mb-4">The analysis completed but returned no data.</p>
            <Button variant="outline" onClick={() => setLocation("/")} data-testid="button-back-no-results">
              <ArrowLeft className="w-4 h-4" />
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { repoInfo } = analysis;

  return (
    <div className="min-h-screen bg-background">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur-sm"
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold truncate" data-testid="text-repo-name">
                  {repoInfo.owner}/{repoInfo.name}
                </h1>
                {repoInfo.language && (
                  <Badge variant="outline" className="text-[10px]" data-testid="badge-language">
                    {repoInfo.language}
                  </Badge>
                )}
                {analysis.techStack?.frameworks?.slice(0, 3).map((fw) => (
                  <Badge key={fw} variant="secondary" className="text-[10px]" data-testid={`badge-framework-${fw}`}>
                    {fw}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1" data-testid="text-stars">
                  <Star className="w-3 h-3" style={{ color: "hsl(42 93% 56%)" }} />
                  {repoInfo.stars?.toLocaleString() || 0}
                </span>
                <span className="flex items-center gap-1" data-testid="text-forks">
                  <GitFork className="w-3 h-3" />
                  {repoInfo.forks?.toLocaleString() || 0}
                </span>
                <a
                  href={repoInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:underline"
                  data-testid="link-repo"
                >
                  <ExternalLink className="w-3 h-3" />
                  GitHub
                </a>
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={!!exportLoading} data-testid="button-export">
                {exportLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Export Format</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportPng} data-testid="menu-export-png">
                <FileImage className="w-4 h-4 mr-2" />
                Export as PNG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportSvg} data-testid="menu-export-svg">
                <FileCode className="w-4 h-4 mr-2" />
                Export as SVG
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf} data-testid="menu-export-pdf">
                <FileText className="w-4 h-4 mr-2" />
                Export as PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Generate</DropdownMenuLabel>
              <DropdownMenuItem onClick={handleGenerateReadme} data-testid="menu-generate-readme">
                <FileText className="w-4 h-4 mr-2" />
                README Architecture
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleGenerateMermaid} data-testid="menu-generate-mermaid">
                <Network className="w-4 h-4 mr-2" />
                Mermaid Diagram
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {repoInfo.description && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-muted-foreground mb-6"
            data-testid="text-repo-description"
          >
            {repoInfo.description}
          </motion.p>
        )}

        <Tabs defaultValue="architecture" data-testid="tabs-analysis">
          <TabsList className="flex-wrap h-auto gap-1 mb-4" data-testid="tabs-list">
            <TabsTrigger value="architecture" data-testid="tab-architecture">
              <Cpu className="w-3.5 h-3.5 mr-1" />
              Architecture
            </TabsTrigger>
            <TabsTrigger value="endpoints" data-testid="tab-endpoints">
              <Server className="w-3.5 h-3.5 mr-1" />
              API Endpoints
            </TabsTrigger>
            <TabsTrigger value="frontend-backend" data-testid="tab-frontend-backend">
              <Network className="w-3.5 h-3.5 mr-1" />
              Frontend-Backend
            </TabsTrigger>
            <TabsTrigger value="database" data-testid="tab-database">
              <Database className="w-3.5 h-3.5 mr-1" />
              Database
            </TabsTrigger>
            <TabsTrigger value="services" data-testid="tab-services">
              <Globe className="w-3.5 h-3.5 mr-1" />
              Services
            </TabsTrigger>
            <TabsTrigger value="stack" data-testid="tab-stack">
              <Layers className="w-3.5 h-3.5 mr-1" />
              Tech Stack
            </TabsTrigger>
            <TabsTrigger value="env" data-testid="tab-env">
              <Settings className="w-3.5 h-3.5 mr-1" />
              Env Vars
            </TabsTrigger>
            <TabsTrigger value="contributing" data-testid="tab-contributing">
              <Users className="w-3.5 h-3.5 mr-1" />
              Contributing
            </TabsTrigger>
          </TabsList>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
            <TabsContent value="architecture">
              <ArchitectureFlowTab analysis={analysis} />
            </TabsContent>

            <TabsContent value="endpoints">
              <ApiEndpointsTab endpoints={analysis.apiEndpoints || []} />
            </TabsContent>

            <TabsContent value="frontend-backend">
              <FrontendBackendTab flows={analysis.frontendBackendFlows || []} />
            </TabsContent>

            <TabsContent value="database">
              <DatabaseTab mapping={analysis.databaseMapping} />
            </TabsContent>

            <TabsContent value="services">
              <ExternalServicesTab services={analysis.externalServices || []} />
            </TabsContent>

            <TabsContent value="stack">
              <TechStackTab stack={analysis.techStack || { languages: [], frameworks: [], libraries: [], buildTools: [], testing: [], deployment: [] }} />
            </TabsContent>

            <TabsContent value="env">
              <EnvVariablesTab variables={analysis.envVariables || []} />
            </TabsContent>

            <TabsContent value="contributing">
              <ContributingTab suggestions={analysis.contributionSuggestions || []} />
            </TabsContent>
          </motion.div>
        </Tabs>
      </div>
    </div>
  );
}
