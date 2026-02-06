import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogIn, UserPlus } from "lucide-react";

export function Navbar() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  const isAuthPage = location === "/signin" || location === "/signup";
  if (isAuthPage) return null;

  return (
    <nav
      className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      data-testid="navbar"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 h-14">
        <Link href="/" data-testid="link-home">
          <span
            className="text-xl font-bold cursor-pointer"
            style={{
              background: "linear-gradient(135deg, hsl(9 75% 61%), hsl(35 90% 55%))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            RepoScope
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />

          {isLoading ? null : user ? (
            <Link href="/profile" data-testid="link-profile">
              <Avatar className="cursor-pointer hover-elevate h-9 w-9">
                <AvatarFallback
                  className="text-sm font-semibold"
                  style={{
                    background: "hsl(9 75% 61% / 0.15)",
                    color: "hsl(9 75% 61%)",
                  }}
                >
                  {user.username.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <>
              <Link href="/signin">
                <Button variant="ghost" size="sm" data-testid="button-nav-signin">
                  <LogIn className="w-4 h-4 mr-1.5" />
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button size="sm" data-testid="button-nav-signup">
                  <UserPlus className="w-4 h-4 mr-1.5" />
                  Sign Up
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
