// Stub for the `server-only` package: wave-2 tool modules import it, and the
// real package throws when loaded outside a React Server Components runtime.
// check-agent-tools.mts resolves the specifier here so the registry union can
// be exercised under plain tsx without neutering server-only app-wide.
module.exports = {};
