"use client";

import { useState } from "react";

import { buildWhatsAppLink } from "@/lib/attribution/ref-code";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { FieldHint } from "@/components/admin/FieldHint";
import { Check, ClipboardCopy, Link2 } from "lucide-react";

const PHONE_REGEX = /^[0-9]{10,15}$/;

function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="label-caps text-on-surface-variant">
      {children}
    </label>
  );
}

/**
 * Form that mints a signed ref code via POST /api/admin/ref-code and renders
 * the resulting wa.me deep link. The HMAC secret never reaches the client —
 * only the minted code travels back.
 */
export function LinkGeneratorForm({ defaultPhone }: { defaultPhone: string }) {
  const [campaign, setCampaign] = useState("");
  const [adset, setAdset] = useState("");
  const [ad, setAd] = useState("");
  const [phone, setPhone] = useState(defaultPhone);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function validatePhone(value: string): boolean {
    if (!PHONE_REGEX.test(value)) {
      setPhoneError("Número inválido. Incluí código de país (ej: 549XXX...)");
      return false;
    }
    setPhoneError(null);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!campaign.trim() || !validatePhone(phone)) return;

    setBusy(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/admin/ref-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId: campaign.trim(),
          adsetId: adset.trim() || "general",
          adId: ad.trim() || "general",
        }),
      });
      if (!res.ok) {
        setSubmitError("No se pudo generar el código de referido — intentá de nuevo");
        return;
      }
      const { code: refCode } = await res.json();
      setGeneratedUrl(buildWhatsAppLink(phone.trim(), refCode));
      setCopied(false);
    } catch {
      setSubmitError("No se pudo generar el código de referido — intentá de nuevo");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setSubmitError("No se pudo copiar — seleccioná el link a mano");
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <Card>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="campaign">
              Campaña <span className="text-error">*</span>
            </Label>
            <Input
              id="campaign"
              placeholder="ej: indumentaria-junio"
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              required
            />
            <FieldHint>Nombre de la campaña de ads: así sabés de dónde vino cada lead.</FieldHint>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="adset">Adset (opcional)</Label>
            <Input
              id="adset"
              placeholder="ej: clubes-formosa"
              value={adset}
              onChange={(e) => setAdset(e.target.value)}
            />
            <FieldHint>Conjunto de anuncios dentro de la campaña (segmentación de Meta Ads).</FieldHint>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ad">Ad (opcional)</Label>
            <Input
              id="ad"
              placeholder="ej: video-camisetas-oferta"
              value={ad}
              onChange={(e) => setAd(e.target.value)}
            />
            <FieldHint>El anuncio puntual. Dejalo vacío si no hace falta ese nivel de detalle.</FieldHint>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="phone">
              Teléfono <span className="text-error">*</span>
            </Label>
            <Input
              id="phone"
              placeholder="549XXXXXXXXXX"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (phoneError) validatePhone(e.target.value);
              }}
              onBlur={(e) => validatePhone(e.target.value)}
            />
            {phoneError ? (
              <p className="text-xs text-error">{phoneError}</p>
            ) : (
              <p className="text-xs text-on-surface-variant">Incluí código de país sin el + (ej: 549XXXXXXXXXX)</p>
            )}
          </div>

          {submitError && <p className="text-sm text-error">{submitError}</p>}

          <Button type="submit" disabled={!campaign.trim() || busy} className="w-full">
            <Link2 className="w-4 h-4" />
            {busy ? "Generando…" : "Generar link"}
          </Button>
        </form>
      </Card>

      {generatedUrl && (
        <Card title="Link generado">
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-md px-3 py-2 text-xs text-on-surface break-all data-mono bg-surface-container border border-outline-variant">
              {generatedUrl}
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={handleCopy}>
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-status-success" />
                  <span className="text-status-success">Copiado</span>
                </>
              ) : (
                <>
                  <ClipboardCopy className="w-4 h-4" />
                  <span>Copiar</span>
                </>
              )}
            </Button>
          </div>
          <p className="mt-4 text-xs text-on-surface-variant">
            <span className="font-medium text-on-surface">Atribución: </span>
            Campaña: <span className="text-primary">{campaign}</span>
            {adset.trim() && <> · Adset: <span className="text-primary">{adset}</span></>}
            {ad.trim() && <> · Ad: <span className="text-primary">{ad}</span></>}
          </p>
        </Card>
      )}
    </div>
  );
}
