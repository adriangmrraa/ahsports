import { NextResponse } from "next/server";
import { authorizeAgentApi } from "@/lib/agent/rbac";
import { runAgentConfigTest } from "@/lib/agent/test-agent";

/**
 * B-06 — GET /api/admin/test-agent: same report as POST /api/agent/test for
 * admin dashboards (config + channel credential status + cheap provider
 * ping; no message send, no secrets in the response).
 */
export async function GET() {
  const auth = await authorizeAgentApi();
  if (!auth.ok) {
    return NextResponse.json(
      { success: false, message: "No autorizado" },
      { status: auth.status }
    );
  }

  try {
    const report = await runAgentConfigTest();
    return NextResponse.json({ success: report.ok, ...report });
  } catch (error) {
    console.error("[api/admin/test-agent] config test failed:", error);
    return NextResponse.json(
      { success: false, message: "Error interno del servidor" },
      { status: 500 }
    );
  }
}
