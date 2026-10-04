"use client";

import { captureException } from "doxa-watch/next/client";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => captureException(error), [error]);

  return (
    <main className="grid min-h-screen place-items-center bg-[#EFF6FF] px-4">
      <section className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-50 text-red-700">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-2xl font-bold text-[#0F2444]">Something went wrong</h1>
        <p className="mt-3 text-sm leading-6 text-[#64748B]">The page could not be loaded. Try again, or return to the dashboard.</p>
        <Button className="mt-6 bg-[#2563EB] hover:bg-blue-700" onClick={reset} type="button">
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </section>
    </main>
  );
}
