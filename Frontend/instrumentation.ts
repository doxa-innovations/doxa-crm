export { onRequestError } from "@doxa-innovations/watch/next";

// Doxa Watch reports the requests, exceptions, queries, outgoing requests and logs of the Node.js server.
// Without DOXA_WATCH_TOKEN it does nothing.
export async function register() {
  // Keep the imports inside this block: instrumentation is also compiled for the Edge runtime (middleware),
  // where lib/auth (pg) cannot be bundled. Next removes the block from that build.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { register: registerDoxaWatch } = await import("@doxa-innovations/watch/next");
    const { resolveWatchUser } = await import("@/lib/doxa-watch-user");

    registerDoxaWatch({ resolveUser: resolveWatchUser });
  }
}
