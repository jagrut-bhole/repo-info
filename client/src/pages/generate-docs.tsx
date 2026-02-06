import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  FileText,
  Search,
  ArrowLeft,
  Download,
  Copy,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";

const GITHUB_URL_PATTERN = /^(https?:\/\/)?(www\.)?github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\/?$/;

export default function GenerateDocs() {
  const [url, setUrl] = useState("");
  const [validationError, setValidationError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [readme, setReadme] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { token } = useAuth();

  const validateUrl = (value: string): boolean => {
    if (!value.trim()) {
      setValidationError("Please enter a GitHub repository URL");
      return false;
    }
    if (!GITHUB_URL_PATTERN.test(value.trim())) {
      setValidationError("URL must match: github.com/username/repository");
      return false;
    }
    setValidationError("");
    return true;
  };

  const handleUrlChange = (value: string) => {
    setUrl(value);
    if (value.trim()) {
      validateUrl(value);
    } else {
      setValidationError("");
    }
  };

  const handleGenerate = async () => {
    if (!validateUrl(url)) return;

    setIsGenerating(true);
    setReadme(null);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/generate-full-readme", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate documentation");
      }

      const data = await res.json();
      setReadme(data.readme);
      toast({ title: "Documentation generated successfully" });
    } catch (err: any) {
      toast({
        title: "Generation Failed",
        description: err.message || "Could not generate documentation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!readme) return;
    const blob = new Blob([readme], { type: "text/markdown" });
    const link = document.createElement("a");
    link.download = "README.md";
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    toast({ title: "Downloaded", description: "README.md saved to your device" });
  };

  const handleCopy = async () => {
    if (!readme) return;
    try {
      await navigator.clipboard.writeText(readme);
      setCopied(true);
      toast({ title: "Copied to clipboard" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isGenerating) {
      handleGenerate();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 mb-8"
        >
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")} data-testid="button-back-docs">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-docs-title">Generate README Docs</h1>
            <p className="text-sm text-muted-foreground">
              Enter a GitHub repository URL to generate complete documentation
            </p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="github.com/owner/repository"
                    value={url}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="pl-9"
                    disabled={isGenerating}
                    data-testid="input-docs-url"
                  />
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  data-testid="button-generate-docs"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      Generate
                    </span>
                  )}
                </Button>
              </div>

              <AnimatePresence>
                {validationError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex items-center gap-2 mt-2 text-sm text-destructive"
                    data-testid="text-docs-validation-error"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {validationError}
                  </motion.div>
                )}
              </AnimatePresence>
            </CardContent>
          </Card>
        </motion.div>

        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16"
          >
            <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: "hsl(9 75% 61%)" }} />
            <h3 className="text-lg font-semibold mb-2">Analyzing Repository</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              This may take a moment. We're scanning the repository structure, analyzing the code, and generating comprehensive documentation.
            </p>
          </motion.div>
        )}

        <AnimatePresence>
          {readme && !isGenerating && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4 }}
            >
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold" data-testid="text-docs-result-title">Generated README</h2>
                  <Badge variant="outline" className="text-[10px]">Markdown</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={handleCopy} data-testid="button-copy-docs">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button onClick={handleDownload} data-testid="button-download-docs">
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              </div>

              <Card>
                <CardContent className="p-0">
                  <ScrollArea className="h-[600px]">
                    <pre className="p-6 text-sm leading-relaxed whitespace-pre-wrap font-mono" data-testid="text-docs-content">
                      {readme}
                    </pre>
                  </ScrollArea>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
