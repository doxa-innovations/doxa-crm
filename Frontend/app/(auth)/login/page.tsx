
"use client";

import { ArrowRight, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { refreshCurrentUser, refreshFastApiToken } from "@/lib/auth-token";

function loginErrorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
        ? error.message
        : typeof error === "string"
          ? error
          : "";
  const normalized = message.toLowerCase();

  if (
    normalized.includes("server") ||
    normalized.includes("fetch") ||
    normalized.includes("database") ||
    normalized.includes("tenant/user")
  ) {
    return "Sign-in is temporarily unavailable. Please try again in a moment.";
  }

  return message || "Sign in failed.";
}

export default function LoginPage() {
  const router = useRouter();
  const [callbackUrl, setCallbackUrl] = React.useState("/dashboard");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    const nextCallbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
    setCallbackUrl(nextCallbackUrl?.startsWith("/") && !nextCallbackUrl.startsWith("//") && !nextCallbackUrl.includes("\\") ? nextCallbackUrl : "/dashboard");
    if (new URLSearchParams(window.location.search).has("error")) {
      setErrorMessage("Google sign-in was not completed. Use an approved account or contact your administrator.");
    }
  }, []);

  async function signInWithGoogle() {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: callbackUrl, errorCallbackURL: "/login?error=google" });
      if (result.error) throw new Error(result.error.message || "Google sign-in failed. Please try again.");
    } catch (error) {
      setErrorMessage(loginErrorMessage(error));
      setIsSubmitting(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const { error } = await authClient.signIn.email({
        email,
        password,
        callbackURL: callbackUrl,
        rememberMe: true,
      });

      if (error) {
        setErrorMessage(loginErrorMessage(error) || "Email or password is not correct.");
        return;
      }

      await refreshFastApiToken();
      await refreshCurrentUser();
      router.push(callbackUrl);
      router.refresh();
    } catch (error) {
      setErrorMessage(loginErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fff] px-4 py-10">
      <Card className="w-full max-w-md border-white/10 bg-white shadow-2xl">
        <CardHeader className="gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0f2a44] text-white">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-lg font-semibold text-[#0f2a44]">Doxa CRM</p>
              <p className="text-xs font-medium uppercase tracking-normal text-slate-500">Secure workspace</p>
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl text-slate-950">Sign in</CardTitle>
            <CardDescription>Use your CRM account to continue.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Button className="mb-5 w-full" variant="outline" disabled={isSubmitting} type="button" onClick={signInWithGoogle}>
            Continue with Google
          </Button>
          <p className="mb-4 text-center text-sm text-slate-600">Or sign in with your CRM password</p>
          <form className="grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                autoComplete="email"
                id="email"
                inputMode="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                required
                type="email"
                value={email}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                autoComplete="current-password"
                id="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
                required
                type="password"
                value={password}
              />
            </div>
            {errorMessage ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {errorMessage}
              </div>
            ) : null}
            <Button className="mt-2 w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Signing in..." : "Sign in"}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
