/**
 * DB-free behavioral check for the agent tool registry (regression guard).
 *
 * It runs WITHOUT a live database: a placeholder `DATABASE_URL` is set before
 * the tool modules are dynamically imported so the Neon client module loads, but
 * no query is ever issued (only schema projection and early validation paths are
 * exercised).
 *
 * The key regression it guards against: a `.refine(...)`/`.transform(...)` input
 * schema is a `ZodEffects` (no `.shape`), so projecting it in
 * `zodToParameters`/`toToolSpec` used to throw
 * "Cannot convert undefined or null to object" the moment the loop built its
 * tool specs. Every registered tool (read + draft) MUST now project cleanly.
 *
 * Run: npm run check:agent-tools
 */

process.env.DATABASE_URL ??= "postgresql://check:check@127.0.0.1:5432/check";
process.env.SESSION_SECRET ??= "check-session-secret";
process.env.SECRET_ENCRYPTION_KEY ??= "0".repeat(64);

let failures = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

const { ALL_AGENT_TOOLS, buildToolSpecs } = await import("@/lib/agents/tools/registry");
const { toToolSpec, AGENT_TOOL_EFFECTS } = await import("@/lib/agents/tools/types");
const { draftLeadTool } = await import("@/lib/agents/tools/draft");

console.log(`\nRegistry: ${ALL_AGENT_TOOLS.length} tools`);

check(ALL_AGENT_TOOLS.length > 0, "registry is non-empty");
check(
  ALL_AGENT_TOOLS.every((tool) => AGENT_TOOL_EFFECTS.includes(tool.effect)),
  `every tool effect is executable (${AGENT_TOOL_EFFECTS.join("|")})`,
);

// ── the regression guard: EVERY tool must project to a provider spec ─────────
console.log("\nSpec projection (regression guard)");
for (const tool of ALL_AGENT_TOOLS) {
  let spec: { name: string; description: string; parameters: { type?: string } } | null = null;
  try {
    spec = toToolSpec(tool);
  } catch (error) {
    check(false, `toToolSpec(${tool.id}) does not throw — ${(error as Error).message}`);
    continue;
  }
  check(spec !== null && spec.name === tool.id, `toToolSpec(${tool.id}) succeeds and keeps its id`);
  check(spec?.parameters?.type === "object", `toToolSpec(${tool.id}) yields an object parameter schema`);
}

let bulk: unknown[] | null = null;
try {
  bulk = buildToolSpecs([...ALL_AGENT_TOOLS]);
} catch (error) {
  check(false, `buildToolSpecs(all) does not throw — ${(error as Error).message}`);
}
check(bulk !== null && bulk.length === ALL_AGENT_TOOLS.length, "buildToolSpecs(all) succeeds for the whole registry");

// ── draftLead: plain ZodObject + handler-level email/phone rule ──────────────
console.log("\ndraftLead schema + validation semantics");
const leadSpec = toToolSpec(draftLeadTool) as {
  parameters: { properties: Record<string, unknown>; required?: string[] };
};
const leadProps = Object.keys(leadSpec.parameters.properties);
check(leadProps.includes("name") && leadProps.includes("email") && leadProps.includes("phone"), "projects name/email/phone properties");
check((leadSpec.parameters.required ?? []).includes("name"), "name is required");
check(!(leadSpec.parameters.required ?? []).includes("email"), "email is optional (contact method checked in handler)");

const noContact = await draftLeadTool.handler(
  { name: "Sin Contacto", email: null, phone: null, organizationName: null, role: null, notes: null },
  {},
);
check(
  typeof noContact === "object" && noContact !== null && (noContact as { ok?: boolean }).ok === false,
  "handler rejects a lead with neither email nor phone (no DB write)",
);
check(
  (noContact as { error?: string }).error === "invalid_input",
  "rejection reports a structured invalid_input error",
);

console.log("");
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exitCode = 1;
} else {
  console.log("agent tool checks: PASS");
}
