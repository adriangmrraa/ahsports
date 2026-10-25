import { PageHeader, Card } from "@/components/ui/Card";
import { PageGuide } from "@/components/admin/PageGuide";
import { ProveedorForm } from "./ProveedorForm";

export default function NuevoProveedorPage() {
  return (
    <>
      <PageHeader title="Nuevo proveedor" subtitle="Datos de contacto para compras y futura automatización" />
      <PageGuide
        what="Un proveedor es quién te vende telas o insumos."
        whatFor="Guardá sus datos para asociarlos a cada material y tener a mano a quién comprarle."
      />
      <Card>
        <ProveedorForm />
      </Card>
    </>
  );
}
