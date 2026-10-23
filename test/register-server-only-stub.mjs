// node:test runs server modules without the React Server Components condition,
// where the `server-only` marker package throws at import time. The RSC
// bundler resolves it to the package's empty.js via the "react-server"
// condition; this synchronous resolve hook does the same for the `server-only`
// specifier only, so every other package resolves normally.
//
// Registered through --import before any test file loads.
import { registerHooks } from "node:module";

const EMPTY_URL = new URL("./stubs/empty-server-only.cjs", import.meta.url).href;
const FAKE_DB_TRANSACTION_URL = new URL(
  "./stubs/fake-db-transaction.cjs",
  import.meta.url
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: EMPTY_URL, shortCircuit: true };
    }
    // Dynamic import() bypasses Module._load interception (which covers
    // static require()); route the transaction seam to the in-memory fake.
    if (
      specifier === "@/lib/db-transaction" ||
      specifier.endsWith("/src/lib/db-transaction") ||
      specifier.endsWith("/src/lib/db-transaction.ts")
    ) {
      return { url: FAKE_DB_TRANSACTION_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
