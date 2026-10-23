// Runtime stand-in for the `server-only` marker package.
//
// `server-only` throws when imported outside the React Server Components
// bundler. node:test loads the modules under test through plain Node
// (CJS/tsx), so the resolve hook in `register-server-only-stub.mjs` points the
// specifier at this empty module instead.
module.exports = {};
