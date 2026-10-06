"use client";
import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function AccessForm({ mode }: { mode: "invite" | "recover" | "reset" }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">
        {mode === "invite"
          ? "Accept your invitation"
          : mode === "recover"
            ? "Recover your account"
            : "Choose a new password"}
      </h1>
      {done ? (
        <p role="status">
          {mode === "recover"
            ? "If your account is eligible, a recovery link will arrive by email. Check your inbox and spam folder."
            : "Your password is ready. You can now sign in."}
        </p>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            const data = new FormData(e.currentTarget);
            try {
              if (mode === "recover") {
                const result = await authClient.requestPasswordReset({
                  email: String(data.get("email")),
                  redirectTo: "/reset-password",
                });
                if (result.error)
                  throw new Error(
                    result.error.message ||
                      "Recovery is unavailable. Contact your administrator.",
                  );
              } else {
                const token =
                  new URLSearchParams(window.location.search).get("token") ??
                  "";
                const password = String(data.get("password"));
                if (password !== data.get("confirm"))
                  throw new Error("Passwords do not match.");
                if (mode === "invite") {
                  const response = await fetch("/api/team/accept", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, password }),
                  });
                  const body = await response.json();
                  if (!response.ok) throw new Error(body.detail);
                } else {
                  const result = await authClient.resetPassword({
                    token,
                    newPassword: password,
                  });
                  if (result.error) throw new Error(result.error.message);
                }
              }
              setDone(true);
            } catch (error) {
              setMessage(
                error instanceof Error ? error.message : "Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "recover" ? (
            <label className="grid gap-2">
              Work email
              <Input name="email" type="email" autoComplete="email" required />
            </label>
          ) : (
            <>
              <label className="grid gap-2">
                New password
                <Input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <p className="text-sm text-slate-600">
                Use 12–128 characters. A long, unique passphrase works well.
              </p>
              <label className="grid gap-2">
                Confirm password
                <Input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </label>
            </>
          )}
          {message && (
            <p role="alert" className="text-sm text-red-700">
              {message}
            </p>
          )}
          <Button disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "recover"
                ? "Send recovery link"
                : "Save password"}
          </Button>
        </form>
      )}
      <Link className="text-blue-700 underline" href="/login">
        Back to sign in
      </Link>
    </main>
  );
}
