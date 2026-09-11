import { PageHeader, Card } from "@/components/ui/Card";
import { ProveedorForm } from "./ProveedorForm";

export default function NuevoProveedorPage() {
  return (
    <>
      <PageHeader title="Nuevo proveedor" subtitle="Datos de contacto para compras y futura automatización" />
      <Card>
        <ProveedorForm />
      </Card>
    </>
  );
}
