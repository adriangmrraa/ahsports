import type { MetadataRoute } from "next";

import { SITE_URL } from "@/lib/public/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/catalogo`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/presupuesto`, changeFrequency: "monthly", priority: 0.9 },
  ];
}
