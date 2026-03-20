"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { clearTokenCache } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signInAs(email: string, password: string) {
    setLoading(true);
    setError("");
    const { error: signInError } = await authClient.signIn.email({ email, password });
    if (signInError) {
      setError(signInError.message ?? "Login failed");
      setLoading(false);
    } else {
      clearTokenCache();
      queryClient.clear();
      router.replace("/");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message ?? "Login failed");
      setLoading(false);
    } else {
      clearTokenCache();
      queryClient.clear();
      router.replace("/");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background gap-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-foreground">
          Agent Service Desk
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="mt-1 cursor-pointer"
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Quick login
          </p>
          <div className="flex flex-col gap-2">
            {[
              { label: "Agent", email: "agent@demo.com", password: "agent123" },
              { label: "Lead", email: "lead@demo.com", password: "lead123" },
              { label: "Client", email: "client@demo.com", password: "client123" },
            ].map(({ label, email, password }) => (
              <button
                key={label}
                type="button"
                disabled={loading}
                onClick={() => signInAs(email, password)}
                className="cursor-pointer rounded-lg border border-border bg-muted/50 px-3 py-2 text-left text-sm text-foreground transition-colors duration-150 hover:bg-muted disabled:opacity-50"
              >
                <span className="font-medium">{label}</span>
                <span className="ml-2 text-muted-foreground">{email}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
