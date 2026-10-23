import { NextResponse } from "next/server";
import { authorizeAgentApi } from "@/lib/agent/rbac";
import { runAgentConfigTest } from "@/lib/agent/test-agent";

/**
 * B-06 — POST /api/agent/test: admin-gated agent config self-test. Resolves
 * the scoped runtime config and channel credentials (agent_config scoped
 * secrets → env fallback), then a cheap provider ping — never sends a real
 * message and never returns secret values.
 */
export async function POST() {
  const auth = await authorizeAgentApi();
  if (!auth.ok) {
    return NextResponse.json({ error: "No autorizado" }, { status: auth.status });
  }

  try {
    const report = await runAgentConfigTest();
    return NextResponse.json(report);
  } catch (error) {
    console.error("[api/agent/test] config test failed:", error);
    return NextResponse.json(
      { error: "Error al verificar la configuración del agente" },
      { status: 500 }
    );
  }
}
