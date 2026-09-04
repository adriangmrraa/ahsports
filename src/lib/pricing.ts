import { db } from "@/db/client";
import type { PricingSnapshot } from "@/db/schema";
import { bomItems, bomRecipes, materials, orderLines, pricingRules, products, sizes, techniques } from "@/db/schema";
import { eq } from "drizzle-orm";

export type QuoteLineInput = {
  productId: string;
  quantity: number;
  sizeId?: string | null;
  techniqueId?: string | null;
  overrideUnitPrice?: number | null;
};

export type QuoteResult = {
  lines: Array<{
    orderLineId?: string;
    productId: string;
    productName: string;
    quantity: number;
    unitCost: number;
    unitPrice: number;
    subtotal: number;
    materials: Array<{ name: string; totalQuantity: number; unit: string }>;
  }>;
  totals: { cost: number; price: number; margin: number; marginPercent: number };
  rule: { id: string; name: string; marginPercent: number; urgentSurcharge: number; minAdvancePercent: number };
  snapshot: PricingSnapshot;
};

export async function quoteOrder(input: {
  lines: QuoteLineInput[];
  urgent?: boolean;
  pricingRuleId?: string;
}): Promise<QuoteResult> {
  const [activeRule] = input.pricingRuleId
    ? await db.select().from(pricingRules).where(eq(pricingRules.id, input.pricingRuleId)).limit(1)
    : await db.select().from(pricingRules).where(eq(pricingRules.active, true)).limit(1);

  if (!activeRule) {
    throw new Error("No hay regla de pricing activa. Configurar en /admin/configuracion.");
  }

  const rule = {
    id: activeRule.id,
    name: activeRule.name,
    marginPercent: Number(activeRule.marginPercent),
    urgentSurcharge: Number(activeRule.urgentSurcharge),
    minAdvancePercent: Number(activeRule.minAdvancePercent),
  };

  const lines: QuoteResult["lines"] = [];

  for (const line of input.lines) {
    const [product] = await db.select().from(products).where(eq(products.id, line.productId)).limit(1);
    if (!product) continue;

    const technique = line.techniqueId
      ? (await db.select().from(techniques).where(eq(techniques.id, line.techniqueId)).limit(1))[0]
      : null;

    const recipes = await db
      .select()
      .from(bomRecipes)
      .where(eq(bomRecipes.productId, line.productId))
      .limit(50);

    if (recipes.length === 0) {
      console.warn(`[pricing] Producto ${product.sku} (${product.id}) sin recetas configuradas. Costo=0, verificar BOM en /admin/recetas.`);
    }

    const recipe =
      recipes.find((r) => r.sizeId === line.sizeId && r.techniqueId === (line.techniqueId ?? null)) ??
      recipes.find((r) => r.sizeId === line.sizeId) ??
      recipes.find((r) => r.techniqueId === (line.techniqueId ?? null)) ??
      recipes[0];

    let unitCost = 0;
    const aggregated = new Map<string, { name: string; totalQuantity: number; unit: string }>();

    if (recipe) {
      const items = await db.select().from(bomItems).where(eq(bomItems.recipeId, recipe.id));
      for (const it of items) {
        const [material] = await db.select().from(materials).where(eq(materials.id, it.materialId)).limit(1);
        if (!material) continue;
        const qtyPerUnit = Number(it.quantity);
        const waste = Number(it.wastePercent) / 100;
        const qtyWithWaste = qtyPerUnit * (1 + waste);
        const unitPrice = Number(material.unitPrice);
        const cost = qtyWithWaste * unitPrice;
        unitCost += cost;

        const key = material.id;
        const prev = aggregated.get(key);
        if (prev) prev.totalQuantity += qtyWithWaste * line.quantity;
        else aggregated.set(key, { name: material.name, totalQuantity: qtyWithWaste * line.quantity, unit: material.unit });
      }
    }

    if (technique) {
      unitCost += Number(technique.costPerUnit) + Number(technique.setupCost);
    }

    const basePrice = line.overrideUnitPrice ?? Number(product.basePrice);
    const surcharge = input.urgent ? rule.urgentSurcharge / 100 : 0;
    const unitPrice = basePrice * (1 + surcharge);

    const subtotal = unitPrice * line.quantity;

    lines.push({
      productId: line.productId,
      productName: product.name,
      quantity: line.quantity,
      unitCost: round2(unitCost),
      unitPrice: round2(unitPrice),
      subtotal: round2(subtotal),
      materials: Array.from(aggregated.values()).map((m) => ({
        name: m.name,
        totalQuantity: round3(m.totalQuantity),
        unit: m.unit,
      })),
    });
  }

  const cost = lines.reduce((acc, l) => acc + l.unitCost * l.quantity, 0);
  const price = lines.reduce((acc, l) => acc + l.subtotal, 0);
  const margin = price - cost;
  const marginPercent = price > 0 ? (margin / price) * 100 : 0;

  const snapshot: PricingSnapshot = {
    rule,
    lines: lines.map((l) => ({ ...l })),
    totals: { cost: round2(cost), price: round2(price), margin: round2(margin), marginPercent: round2(marginPercent) },
    generatedAt: new Date().toISOString(),
  };

  return {
    lines,
    totals: snapshot.totals,
    rule,
    snapshot,
  };
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export async function listSizesForProduct(productId: string) {
  return db.select().from(sizes).where(eq(sizes.productId, productId));
}

export async function listTechniques() {
  return db.select().from(techniques).where(eq(techniques.active, true));
}

export async function listMaterials() {
  return db.select().from(materials).where(eq(materials.active, true));
}

export async function listProducts() {
  return db.select().from(products).where(eq(products.active, true));
}

export async function getOrderLine(id: string) {
  return db.select().from(orderLines).where(eq(orderLines.id, id)).limit(1);
}