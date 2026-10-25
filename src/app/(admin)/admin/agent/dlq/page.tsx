import Link from "next/link";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { INBOUND_JOB_MAX_ATTEMPTS, listDeadInboundJobs } from "@/lib/messaging/inbound-queue";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { PageGuide } from "@/components/admin/PageGuide";
import { channelBadgeTone, INBOX_CHANNEL_LABEL } from "../inbox/filters";
import { DlqRetryButton } from "./DlqRetryButton";

/**
 * C-06 — /admin/agent/dlq: dead-letter queue viewer for the durable inbound
 * queue (A-02). Lists jobs that exhausted their drain attempts — each row
 * keeps channel, account, last error, attempt count and timestamps — plus a
 * manual "Reintentar" that re-queues the job for another dispatch cycle.
 * Admin/gerencia only; un-migrated installs render empty.
 */
export default async function AgentDlqPage() {
  await requireAgentAdmin();
  const jobs = await listDeadInboundJobs(200);

  return (
    <>
      <PageHeader
        title="Cola fallida (DLQ)"
        subtitle={
          jobs.length === 0
            ? "Sin trabajos fallidos"
            : `${jobs.length} ${jobs.length === 1 ? "trabajo agotó" : "trabajos agotaron"} sus ${INBOUND_JOB_MAX_ATTEMPTS} reintentos`
        }
        action={<LinkButton href="/admin/agent/inbox">Ver conversaciones</LinkButton>}
      />

      <PageGuide
        what="La DLQ guarda los mensajes entrantes que agotaron sus reintentos automáticos."
        whatFor="Revisá el último error y reintentá cuando el problema esté resuelto. Reintentar vuelve a encolar el mensaje."
      />

      {jobs.length === 0 ? (
        <EmptyState
          title="Sin trabajos en dead-letter"
          description={`Cuando un turno inbound agote sus ${INBOUND_JOB_MAX_ATTEMPTS} reintentos de despacho, aparecerá acá con su último error.`}
          action={<LinkButton href="/admin/agent/inbox">Volver a conversaciones</LinkButton>}
        />
      ) : (
        <Card>
          <Table responsive>
            <THead>
              <tr>
                <TH>Canal</TH>
                <TH>Cuenta</TH>
                <TH>Conversación</TH>
                <TH>Último error</TH>
                <TH align="right">Intentos</TH>
                <TH>Actualizado</TH>
                <TH align="right">Acciones</TH>
              </tr>
            </THead>
            <tbody>
              {jobs.map((job) => (
                <TR key={job.id}>
                  <TD label="Canal">
                    <Badge tone={channelBadgeTone(job.channel)}>
                      {INBOX_CHANNEL_LABEL[job.channel] ?? job.channel}
                    </Badge>
                  </TD>
                  <TD label="Cuenta">
                    <div className="text-on-surface">
                      {job.accountDisplayName ?? job.accountSender ?? "Sin cuenta"}
                    </div>
                    {job.accountProvider && (
                      <div className="text-xs text-on-surface-variant">{job.accountProvider}</div>
                    )}
                  </TD>
                  <TD label="Conversación">
                    <Link
                      href={`/admin/agent/inbox/${job.conversationId}`}
                      className="text-primary hover:underline data-mono"
                      title={job.conversationKey}
                    >
                      {job.conversationId.slice(0, 8)}…
                    </Link>
                  </TD>
                  <TD label="Último error">
                    <span
                      className="block max-w-xs truncate text-on-surface-variant"
                      title={job.lastError ?? undefined}
                    >
                      {job.lastError ?? "—"}
                    </span>
                  </TD>
                  <TD align="right" className="text-on-surface" label="Intentos">
                    {job.attempts}
                  </TD>
                  <TD className="text-on-surface-variant whitespace-nowrap" label="Actualizado">
                    {formatDateTime(job.updatedAt)}
                  </TD>
                  <TD align="right">
                    <DlqRetryButton jobId={job.id} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  );
}
