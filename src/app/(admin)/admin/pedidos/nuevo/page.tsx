import { db } from "@/db/client";
import { contacts, organizations } from "@/db/schema";
import { asc } from "drizzle-orm";
import { PageHeader, Card } from "@/components/ui/Card";
import { NewOrderForm } from "./NewOrderForm";

export default async function NuevoPedidoPage() {
  const orgs = await db
    .select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .orderBy(asc(organizations.name))
    .limit(200);
  const cts = await db
    .select({ id: contacts.id, name: contacts.name, organizationId: contacts.organizationId })
    .from(contacts)
    .orderBy(asc(contacts.name))
    .limit(500);

  return (
    <>
      <PageHeader title="Nuevo pedido" subtitle="Crear un pedido interno desde el panel" />
      <Card>
        <NewOrderForm organizations={orgs} contacts={cts} />
      </Card>
    </>
  );
}
