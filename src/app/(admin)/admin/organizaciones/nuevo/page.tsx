import { PageHeader, Card } from "@/components/ui/Card";
import { OrgForm } from "./OrgForm";

export default function NuevaOrganizacionPage() {
  return (
    <>
      <PageHeader title="Nueva organización" subtitle="Alta de organización con su contacto inicial" />
      <Card>
        <OrgForm />
      </Card>
    </>
  );
}
