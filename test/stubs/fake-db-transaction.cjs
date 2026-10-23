// Runtime stand-in for `src/lib/db-transaction` used by dynamic imports.
//
// `Module._load` interception covers static `require()`s; a dynamic `import()`
// goes through the ESM loader instead. The preload resolve hook points this
// specifier here, and `installFakeDb()` publishes the active FakeDb on
// globalThis so the transaction handle is the same in-memory instance.
//
// `exports.<name> =` (not `module.exports = { ... }`) so cjs-module-lexer
// exposes the named export to `import { withDbTransaction }`.
exports.withDbTransaction = async function withDbTransaction(callback) {
  const fake = globalThis.__FAKE_DB__;
  if (!fake) {
    throw new Error("fake db not installed: call installFakeDb() before use");
  }
  return fake.runTransaction(callback);
};
