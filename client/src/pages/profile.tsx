import { useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import {
  User,
  History,
  ExternalLink,
  LogOut,
  GitFork,
  Calendar,
} from "lucide-react";

interface AnalysisSummary {
  id: number;
  repoUrl: string;
  owner: string;
  repo: string;
  createdAt: string;
}

export default function Profile() {
  const { user, token, logout, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !user) {
      setLocation("/signup");
    }
  }, [authLoading, user, setLocation]);

  const { data: analyses, isLoading: analysesLoading } = useQuery<AnalysisSummary[]>({
    queryKey: ["/api/user/analyses"],
    queryFn: async () => {
      const res = await fetch("/api/user/analyses", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch analyses");
      return res.json();
    },
    enabled: !!token,
  });

  if (authLoading || !user) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    setLocation("/");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <Card className="mb-6">
            <CardContent className="p-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <Avatar className="h-16 w-16">
                    <AvatarFallback
                      className="text-xl font-bold"
                      style={{
                        background: "hsl(9 75% 61% / 0.15)",
                        color: "hsl(9 75% 61%)",
                      }}
                    >
                      {user.username.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h1 className="text-2xl font-bold" data-testid="text-profile-username">
                      {user.username}
                    </h1>
                    <p className="text-sm text-muted-foreground" data-testid="text-profile-stats">
                      {analyses?.length ?? 0} repositories analyzed
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 mr-1.5" />
                  Sign Out
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2 pb-4">
              <History className="w-5 h-5" style={{ color: "hsl(9 75% 61%)" }} />
              <CardTitle className="text-lg">Recent Analyses</CardTitle>
            </CardHeader>
            <CardContent>
              {analysesLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted/50 rounded-md animate-pulse" />
                  ))}
                </div>
              ) : !analyses || analyses.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <GitFork className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No analyses yet</p>
                  <p className="text-xs mt-1">Analyze a repository to see it here</p>
                  <Link href="/">
                    <Button className="mt-4" size="sm" data-testid="button-analyze-first">
                      Analyze a Repository
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {analyses.map((analysis) => (
                    <Link
                      key={analysis.id}
                      href={`/analysis?id=${analysis.id}`}
                    >
                      <div
                        className="flex items-center justify-between gap-4 p-3 rounded-md hover-elevate cursor-pointer border"
                        data-testid={`card-analysis-${analysis.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center"
                            style={{ backgroundColor: "hsl(9 75% 61% / 0.12)" }}
                          >
                            <GitFork className="w-4 h-4" style={{ color: "hsl(9 75% 61%)" }} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate" data-testid={`text-repo-name-${analysis.id}`}>
                              {analysis.owner}/{analysis.repo}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                              <Calendar className="w-3 h-3" />
                              <span>{formatDate(analysis.createdAt)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="outline" className="text-[10px]">
                            View
                          </Badge>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
