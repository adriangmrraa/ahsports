import { PageHeader, Card } from "@/components/ui/Card";
import { InsumoForm } from "./InsumoForm";

export default function NuevoInsumoPage() {
  return (
    <>
      <PageHeader title="Nuevo material / insumo" subtitle="Telas, hilos, films, tintas, etc." />
      <Card>
        <InsumoForm />
      </Card>
    </>
  );
}