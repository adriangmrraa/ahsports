import { PageHeader, Card } from "@/components/ui/Card";
import { ProductoForm } from "./ProductoForm";

export default function NuevoProductoPage() {
  return (
    <>
      <PageHeader title="Nuevo producto" subtitle="Definir SKU, precio base, zonas y pedido mínimo" />
      <Card>
        <ProductoForm />
      </Card>
    </>
  );
}