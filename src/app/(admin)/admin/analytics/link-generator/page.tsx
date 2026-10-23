import { PageHeader } from "@/components/ui/Card";
import { getStringSetting } from "@/lib/settings";
import { requireAgentAdmin } from "@/lib/agent/rbac";
import { normalizePhone } from "@/lib/messaging/phone";

import { LinkGeneratorForm } from "./LinkGeneratorForm";

export const metadata = { title: "Generador de links — Admin" };

/**
 * C-02/H-05 — wa.me link generator with signed `ref:` attribution codes.
 * The form mints codes through POST /api/admin/ref-code (HMAC server-side).
 *
 * Business phone resolution (A-16 lands separately): `taller_contacto_phone`
 * setting → WHATSAPP_PHONE_NUMBER env → NEXT_PUBLIC_WHATSAPP_PHONE env;
 * the form stays editable when none is configured.
 */
export default async function LinkGeneratorPage() {
  await requireAgentAdmin();

  const phoneSetting = await getStringSetting("taller_contacto_phone").catch(() => null);
  const rawPhone =
    phoneSetting ??
    process.env.WHATSAPP_PHONE_NUMBER ??
    process.env.NEXT_PUBLIC_WHATSAPP_PHONE ??
    null;
  const defaultPhone = rawPhone ? normalizePhone(rawPhone) : "";

  return (
    <>
      <PageHeader
        title="Generador de links"
        subtitle="Links de WhatsApp con atribución firmada para campañas"
      />
      <LinkGeneratorForm defaultPhone={defaultPhone} />
    </>
  );
}
