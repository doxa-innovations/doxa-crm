"use client";

import { captureException } from "doxa-watch/next/client";
import * as React from "react";

// Replaces the root layout when it fails itself, so it renders its own <html> and <body> and uses no
// component or stylesheet that the failed layout would have provided.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => captureException(error), [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#EFF6FF" }}>
        <main style={{ display: "grid", minHeight: "100vh", placeItems: "center", padding: "0 16px" }}>
          <section
            style={{
              width: "100%",
              maxWidth: 448,
              borderRadius: 12,
              background: "#FFFFFF",
              padding: 32,
              textAlign: "center",
              boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
            }}
          >
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#0F2444" }}>Something went wrong</h1>
            <p style={{ marginTop: 12, fontSize: 14, lineHeight: "24px", color: "#64748B" }}>
              The application could not be loaded. Try again in a moment.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: 24,
                border: 0,
                borderRadius: 8,
                background: "#2563EB",
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 600,
                color: "#FFFFFF",
                cursor: "pointer",
              }}
              type="button"
            >
              Try again
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
