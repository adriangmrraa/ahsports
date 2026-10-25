import { PageHeader, Card } from "@/components/ui/Card";
import { PageGuide } from "@/components/admin/PageGuide";
import { OrgForm } from "./OrgForm";

export default function NuevaOrganizacionPage() {
  return (
    <>
      <PageHeader title="Nueva organización" subtitle="Alta de organización con su contacto inicial" />
      <PageGuide
        what="Una organización es el cliente institucional: club, empresa, colegio o institución."
        whatFor="Cargá una persona de contacto para enviarle presupuestos. Los clientes particulares no necesitan organización."
      />
      <Card>
        <OrgForm />
      </Card>
    </>
  );
}
