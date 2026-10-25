import type { Metadata } from "next";

import { Hero } from "@/components/public/home/Hero";
import { ProofStrip } from "@/components/public/home/ProofStrip";
import { HowItWorks } from "@/components/public/home/HowItWorks";
import { Categories } from "@/components/public/home/Categories";
import { WhySublimated } from "@/components/public/home/WhySublimated";
import { Faq } from "@/components/public/home/Faq";
import { CtaBand } from "@/components/public/home/CtaBand";
import { getPublicBusinessInfo, SITE_NAME, SITE_URL } from "@/lib/public/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * Home pública: landing de posicionamiento y conversión.
 * Server component — toda la animación es CSS; los datos de negocio vienen
 * de settings vía getPublicBusinessInfo (deduplicada por request).
 */
export default async function PublicLanding() {
  const business = await getPublicBusinessInfo();

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: business.name || SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon.svg`,
        ...(business.description ? { description: business.description } : {}),
        ...(business.instagram
          ? { sameAs: [`https://instagram.com/${business.instagram}`] }
          : {}),
      },
      {
        "@type": "SportingGoodsStore",
        "@id": `${SITE_URL}/#business`,
        name: business.name || SITE_NAME,
        url: SITE_URL,
        address: {
          "@type": "PostalAddress",
          ...(business.address ? { streetAddress: business.address } : {}),
          addressLocality: "Formosa",
          addressCountry: "AR",
        },
        ...(business.phoneDisplay ? { telephone: business.phoneDisplay } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        publisher: { "@id": `${SITE_URL}/#organization` },
        inLanguage: "es-AR",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Hero />
      <ProofStrip />
      <HowItWorks />
      <Categories />
      <WhySublimated />
      <Faq />
      <CtaBand whatsappPhone={business.whatsappPhone} />
    </>
  );
}
