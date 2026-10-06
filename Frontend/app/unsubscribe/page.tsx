"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, apiErrorDetail } from "@/lib/api";
export default function Unsubscribe() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  return (
    <main className="mx-auto max-w-lg space-y-5 p-8">
      <h1 className="text-2xl font-semibold">Email preferences</h1>
      <p>
        Unsubscribe from campaign messages. This does not change essential
        account or service notices.
      </p>
      {!done && (
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api.post(
                "/email-preferences/unsubscribe",
                {
                  token: new URLSearchParams(window.location.search).get(
                    "token",
                  ),
                },
                { skipAuth: true },
              );
              setDone(true);
              setMessage(
                "You are unsubscribed. No further campaign messages will be sent.",
              );
            } catch (e) {
              setMessage(apiErrorDetail(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Unsubscribe
        </Button>
      )}
      <p role="status">{message}</p>
    </main>
  );
}
