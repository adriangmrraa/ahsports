import { db } from "@/db/client";
import type { MaterialConsumptionSnapshot, PricingSnapshot } from "@/db/schema";
import {
  applications,
  bomItems,
  productBundleItems,
  productBundles,
  bomRecipes,
  materials,
  orderItems,
  orderLines,
  pricingRules,
  products,
  sizes,
  techniques,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { calculateBomConsumption, consumptionUnit } from "@/lib/consumption";

export type SizeQuantity = { sizeId: string | null; quantity: number };

export type QuoteLineInput = {
  orderLineId?: string;
  productId: string;
  quantity: number;
  /** Server-derived quantities from orderItems. */
  sizeQuantities?: SizeQuantity[];
  /** Kept for one-size/internal callers. */
  sizeId?: string | null;
  techniqueId?: string | null;
  overrideUnitPrice?: number | null;
};

type MaterialSummary = { materialId?: string; name: string; totalQuantity: number; unit: string };
type TechniqueSummary = {
  id: string;
  name: string;
  costPerUnit: number;
  costPerSquareMeter: number;
  setupCost: number;
  setupCostApplied: boolean;
  areaM2: number | null;
};
type SizeQuote = {
  sizeId: string | null;
  sizeLabel: string | null;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  subtotal: number;
  materials: MaterialSummary[];
  consumption: MaterialConsumptionSnapshot[];
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
    materials: MaterialSummary[];
    techniques: TechniqueSummary[];
    sizeBreakdown: SizeQuote[];
    bundleComponents?: Array<{ productId: string; productName: string; quantity: number }>;
  }>;
  totals: { cost: number; price: number; margin: number; marginPercent: number };
  rule: { id: string; name: string; marginPercent: number; urgentSurcharge: number; minAdvancePercent: number; rounding: number };
  snapshot: PricingSnapshot;
};

/** Return persisted size quantities for order lines without accepting client labels/counts. */
export async function loadOrderLineSizeQuantities(orderLineIds: string[]) {
  const result = new Map<string, SizeQuantity[]>();
  if (orderLineIds.length === 0) return result;

  const rows = await db
    .select({ orderLineId: orderItems.orderLineId, sizeId: orderItems.sizeId })
    .from(orderItems)
    .where(inArray(orderItems.orderLineId, orderLineIds));

  for (const row of rows) {
    const current = result.get(row.orderLineId) ?? [];
    const existing = current.find((entry) => entry.sizeId === row.sizeId);
    if (existing) existing.quantity += 1;
    else current.push({ sizeId: row.sizeId, quantity: 1 });
    result.set(row.orderLineId, current);
  }
  return result;
}

/**
 * F6 pricing rules:
 * - material cost uses the recipe's consumption unit; kilo is converted to metre;
 * - setupCost is charged once per order line and technique (lot/setup), not per garment;
 * - costPerSquareMeter is charged only when the line has measured applications;
 * - size-specific recipes are preferred and the complete size breakdown is snapshotted.
 */
export async function quoteOrder(input: { lines: QuoteLineInput[]; urgent?: boolean; pricingRuleId?: string }): Promise<QuoteResult> {
  const [activeRule] = input.pricingRuleId
    ? await db.select().from(pricingRules).where(eq(pricingRules.id, input.pricingRuleId)).limit(1)
    : await db.select().from(pricingRules).where(eq(pricingRules.active, true)).limit(1);

  if (!activeRule) throw new Error("No hay regla de pricing activa. Configurar en /admin/configuracion.");

  const rule = {
    id: activeRule.id,
    name: activeRule.name,
    marginPercent: Number(activeRule.marginPercent),
    urgentSurcharge: Number(activeRule.urgentSurcharge),
    minAdvancePercent: Number(activeRule.minAdvancePercent),
    rounding: Number(activeRule.rounding) || 1,
  };
  const lines: QuoteResult["lines"] = [];

  for (const line of input.lines) {
    const [product] = await db.select().from(products).where(eq(products.id, line.productId)).limit(1);
    if (!product) throw new Error(`Producto ${line.productId} no encontrado.`);

    if (product.productKind === "bundle") {
      if (line.techniqueId) throw new Error(`El conjunto "${product.name}" deriva sus costos de las prendas componentes y no acepta una técnica propia.`);
      lines.push(await quoteBundleLine({ line, product, rule, urgent: input.urgent, pricingRuleId: input.pricingRuleId }));
      continue;
    }

    const lineTechnique = line.techniqueId
      ? (await db.select().from(techniques).where(eq(techniques.id, line.techniqueId)).limit(1))[0]
      : null;
    if (line.techniqueId && !lineTechnique) throw new Error("La técnica seleccionada no existe.");

    const recipes = await db.select().from(bomRecipes).where(eq(bomRecipes.productId, line.productId)).limit(200);
    if (recipes.length === 0) {
      throw new Error(`El producto ${product.sku} ("${product.name}") no tiene receta cargada. Creá el BOM en /admin/recetas antes de cotizar.`);
    }

    const requestedSizes = (line.sizeQuantities?.length ? line.sizeQuantities : [{ sizeId: line.sizeId ?? null, quantity: line.quantity }])
      .filter((entry) => entry.quantity > 0);
    const requestedTotal = requestedSizes.reduce((total, entry) => total + entry.quantity, 0);
    if (requestedTotal !== line.quantity) {
      throw new Error(`Las cantidades por talle de "${product.name}" no coinciden con la cantidad de la línea.`);
    }

    const requestedSizeIds = requestedSizes.flatMap((entry) => entry.sizeId ? [entry.sizeId] : []);
    const sizeRows = requestedSizeIds.length > 0 ? await db.select().from(sizes).where(inArray(sizes.id, requestedSizeIds)) : [];
    const sizeById = new Map(sizeRows.map((size) => [size.id, size]));
    for (const requested of requestedSizes) {
      if (requested.sizeId) {
        const size = sizeById.get(requested.sizeId);
        if (!size || size.productId !== line.productId) throw new Error(`El talle seleccionado no pertenece al producto "${product.name}".`);
      }
    }

    const techniqueCache = new Map<string, typeof techniques.$inferSelect>();
    if (lineTechnique) techniqueCache.set(lineTechnique.id, lineTechnique);
    const getTechnique = async (techniqueId: string | null) => {
      if (!techniqueId) return null;
      const cached = techniqueCache.get(techniqueId);
      if (cached) return cached;
      const [technique] = await db.select().from(techniques).where(eq(techniques.id, techniqueId)).limit(1);
      if (!technique) throw new Error("La técnica de la receta ya no existe.");
      techniqueCache.set(technique.id, technique);
      return technique;
    };

    const chooseRecipe = (sizeId: string | null) =>
      recipes.find((recipe) => recipe.sizeId === sizeId && recipe.techniqueId === (line.techniqueId ?? null))
      ?? recipes.find((recipe) => recipe.sizeId === sizeId)
      ?? recipes.find((recipe) => recipe.sizeId === null && recipe.techniqueId === (line.techniqueId ?? null))
      ?? recipes.find((recipe) => recipe.sizeId === null && recipe.techniqueId === null);

    const groups: Array<SizeQuote & { technique: typeof techniques.$inferSelect | null }> = [];
    const sharedTechniqueIds = new Set<string>();
    const techniqueSnapshots = new Map<string, TechniqueSummary>();
    let sharedTechniqueCost = 0;

    for (const requested of requestedSizes) {
      const recipe = chooseRecipe(requested.sizeId);
      if (!recipe) throw new Error(`No hay receta aplicable para el talle solicitado de "${product.name}".`);
      const items = await db.select().from(bomItems).where(eq(bomItems.recipeId, recipe.id));
      if (items.length === 0) throw new Error(`La receta de "${product.name}" no tiene insumos. Completá sus items antes de cotizar.`);

      const aggregated = new Map<string, MaterialSummary>();
      const consumption: MaterialConsumptionSnapshot[] = [];
      let materialCost = 0;
      for (const item of items) {
        const [material] = await db.select().from(materials).where(eq(materials.id, item.materialId)).limit(1);
        if (!material) throw new Error("La receta referencia un insumo que ya no existe.");
        const calculated = calculateBomConsumption({
          mode: item.consumptionMode,
          directQuantity: item.directQuantity,
          unitsPerConsumptionUnit: item.unitsPerConsumptionUnit,
          legacyQuantity: item.quantity,
          wastePercent: item.wastePercent,
          materialName: material.name,
        });
        if (material.unit === "kilo" && (!material.metersPerKilo || Number(material.metersPerKilo) <= 0)) {
          throw new Error(`El insumo "${material.name}" se compra por kilo pero no tiene metros/kilo cargados. Completá el rendimiento antes de cotizar.`);
        }
        const qtyWithWaste = calculated.calculatedQuantityPerUnit;
        const cost = qtyWithWaste * consumptionUnitCost(material);
        materialCost += cost;
        const previous = aggregated.get(material.id);
        if (previous) previous.totalQuantity += qtyWithWaste * requested.quantity;
        else aggregated.set(material.id, { materialId: material.id, name: material.name, totalQuantity: qtyWithWaste * requested.quantity, unit: consumptionUnit(material.unit) });
        consumption.push({
          itemId: item.id,
          materialId: material.id,
          name: material.name,
          unit: consumptionUnit(material.unit),
          sizeId: requested.sizeId,
          sizeLabel: requested.sizeId ? (sizeById.get(requested.sizeId)?.label ?? null) : null,
          consumptionMode: calculated.mode,
          directQuantity: calculated.directQuantity,
          unitsPerConsumptionUnit: calculated.unitsPerConsumptionUnit,
          baseQuantityPerUnit: round4(calculated.baseQuantityPerUnit),
          calculatedQuantityPerUnit: round4(calculated.calculatedQuantityPerUnit),
          totalQuantity: round3(qtyWithWaste * requested.quantity),
          wastePercent: calculated.wastePercent,
        });
      }

      const technique = await getTechnique(line.techniqueId ?? recipe.techniqueId);
      if (technique) {
        if (technique.costPerUnit) materialCost += Number(technique.costPerUnit);
        if (!sharedTechniqueIds.has(technique.id)) {
          sharedTechniqueIds.add(technique.id);
          sharedTechniqueCost += Number(technique.setupCost);
          techniqueSnapshots.set(technique.id, {
            id: technique.id,
            name: technique.name,
            costPerUnit: Number(technique.costPerUnit),
            costPerSquareMeter: Number(technique.costPerSquareMeter),
            setupCost: Number(technique.setupCost),
            setupCostApplied: true,
            areaM2: null,
          });
        } else if (!techniqueSnapshots.has(technique.id)) {
          techniqueSnapshots.set(technique.id, {
            id: technique.id,
            name: technique.name,
            costPerUnit: Number(technique.costPerUnit),
            costPerSquareMeter: Number(technique.costPerSquareMeter),
            setupCost: Number(technique.setupCost),
            setupCostApplied: false,
            areaM2: null,
          });
        }
      }
      groups.push({
        sizeId: requested.sizeId,
        sizeLabel: requested.sizeId ? (sizeById.get(requested.sizeId)?.label ?? null) : null,
        quantity: requested.quantity,
        unitCost: materialCost,
        unitPrice: 0,
        subtotal: 0,
        materials: [...aggregated.values()].map((material) => ({ ...material, totalQuantity: round3(material.totalQuantity) })),
        consumption,
        technique,
      });
    }

    const sqmTechniqueIds = new Set(groups.filter((group) => group.technique && Number(group.technique.costPerSquareMeter) > 0).map((group) => group.technique!.id));
    if (sqmTechniqueIds.size > 0) {
      if (!line.orderLineId) throw new Error("La técnica cobra por m² pero esta cotización no tiene una línea de pedido con medidas de aplicación.");
      const appRows = await db.select().from(applications).where(eq(applications.orderLineId, line.orderLineId));
      for (const techniqueId of sqmTechniqueIds) {
        const matching = appRows.filter((application) => application.techniqueId === techniqueId);
        const area = matching.reduce((total, application) => total + ((Number(application.widthCm) || 0) * (Number(application.heightCm) || 0) / 10000) * application.quantity, 0);
        const technique = groups.find((group) => group.technique?.id === techniqueId)?.technique;
        if (!technique || area <= 0) throw new Error(`La técnica "${technique?.name ?? "seleccionada"}" cobra por m² y necesita ancho/alto cargados en las aplicaciones del pedido.`);
        sharedTechniqueCost += area * Number(technique.costPerSquareMeter);
        const summary = techniqueSnapshots.get(techniqueId);
        if (summary) summary.areaM2 = round3(area);
      }
    }

    const sharedPerUnit = sharedTechniqueCost / line.quantity;
    const surcharge = input.urgent ? rule.urgentSurcharge / 100 : 0;
    let lineCost = 0;
    let linePrice = 0;
    const lineMaterials = new Map<string, MaterialSummary>();
    for (const group of groups) {
      group.unitCost += sharedPerUnit;
      const computed = roundToStep(group.unitCost * (1 + rule.marginPercent / 100) * (1 + surcharge), rule.rounding);
      group.unitPrice = line.overrideUnitPrice ?? computed;
      group.subtotal = group.unitPrice * group.quantity;
      lineCost += group.unitCost * group.quantity;
      linePrice += group.subtotal;
      for (const material of group.materials) {
        const key = material.materialId ?? material.name;
        const previous = lineMaterials.get(key);
        if (previous) previous.totalQuantity += material.totalQuantity;
        else lineMaterials.set(key, { ...material });
      }
    }

    lines.push({
      orderLineId: line.orderLineId,
      productId: line.productId,
      productName: product.name,
      quantity: line.quantity,
      unitCost: round2(lineCost / line.quantity),
      unitPrice: round2(linePrice / line.quantity),
      subtotal: round2(linePrice),
      materials: [...lineMaterials.values()].map((material) => ({ ...material, totalQuantity: round3(material.totalQuantity) })),
      techniques: [...techniqueSnapshots.values()],
      sizeBreakdown: groups.map((group) => ({
        sizeId: group.sizeId,
        sizeLabel: group.sizeLabel,
        quantity: group.quantity,
        unitCost: round2(group.unitCost),
        unitPrice: round2(group.unitPrice),
        subtotal: round2(group.subtotal),
        materials: group.materials,
        consumption: group.consumption,
      })),
    });
  }

  const cost = lines.reduce((total, line) => total + line.unitCost * line.quantity, 0);
  const price = lines.reduce((total, line) => total + line.subtotal, 0);
  const margin = price - cost;
  const marginPercent = price > 0 ? (margin / price) * 100 : 0;
  const totals = { cost: round2(cost), price: round2(price), margin: round2(margin), marginPercent: round2(marginPercent) };
  const snapshot: PricingSnapshot = { rule, lines: lines.map((line) => ({ ...line })), totals, generatedAt: new Date().toISOString() };
  return { lines, totals, rule, snapshot };
}

function consumptionUnitCost(material: { name: string; unit: string; unitPrice: string; metersPerKilo: string | null }) {
  const price = Number(material.unitPrice);
  if (material.unit !== "kilo") return price;
  const metersPerKilo = Number(material.metersPerKilo);
  if (!metersPerKilo || metersPerKilo <= 0) throw new Error(`El insumo "${material.name}" se compra por kilo pero no tiene metros/kilo cargados. Completá el rendimiento en /admin/insumos antes de cotizar.`);
  return price / metersPerKilo;
}

async function quoteBundleLine({
  line,
  product,
  rule,
  urgent,
  pricingRuleId,
}: {
  line: QuoteLineInput;
  product: typeof products.$inferSelect;
  rule: QuoteResult["rule"];
  urgent?: boolean;
  pricingRuleId?: string;
}): Promise<QuoteResult["lines"][number]> {
  const [bundle] = await db.select().from(productBundles).where(eq(productBundles.productId, product.id)).limit(1);
  if (!bundle) throw new Error(`El conjunto "${product.name}" no tiene componentes configurados.`);
  const components = await db.select().from(productBundleItems).where(eq(productBundleItems.bundleId, bundle.id));
  if (components.length === 0) throw new Error(`El conjunto "${product.name}" no tiene componentes configurados.`);
  const componentProducts = await db.select().from(products).where(inArray(products.id, components.map((item) => item.componentProductId)));
  const componentById = new Map(componentProducts.map((component) => [component.id, component]));
  const requestedSizes = (line.sizeQuantities?.length ? line.sizeQuantities : [{ sizeId: line.sizeId ?? null, quantity: line.quantity }]).filter((entry) => entry.quantity > 0);
  if (requestedSizes.reduce((total, entry) => total + entry.quantity, 0) !== line.quantity) {
    throw new Error(`Las cantidades por talle de "${product.name}" no coinciden con la cantidad de la línea.`);
  }
  const bundleSizeIds = requestedSizes.flatMap((entry) => entry.sizeId ? [entry.sizeId] : []);
  const bundleSizes = bundleSizeIds.length > 0 ? await db.select().from(sizes).where(inArray(sizes.id, bundleSizeIds)) : [];
  const bundleSizeById = new Map(bundleSizes.map((size) => [size.id, size]));
  for (const requested of requestedSizes) {
    if (requested.sizeId && (!bundleSizeById.get(requested.sizeId) || bundleSizeById.get(requested.sizeId)!.productId !== product.id)) {
      throw new Error(`El talle seleccionado no pertenece al conjunto "${product.name}".`);
    }
  }

  const groups = requestedSizes.map((requested) => ({
    sizeId: requested.sizeId,
    sizeLabel: requested.sizeId ? (bundleSizeById.get(requested.sizeId)?.label ?? null) : null,
    quantity: requested.quantity,
    unitCost: 0,
    unitPrice: 0,
    subtotal: 0,
    materials: new Map<string, MaterialSummary>(),
    consumption: [] as MaterialConsumptionSnapshot[],
  }));
  const lineMaterials = new Map<string, MaterialSummary>();
  const techniquesById = new Map<string, TechniqueSummary>();

  for (const component of components) {
    const componentProduct = componentById.get(component.componentProductId);
    if (!componentProduct) throw new Error(`El componente ${component.componentProductId} no existe.`);
    if (componentProduct.productKind !== "garment") throw new Error(`El componente "${componentProduct.name}" debe ser una prenda individual.`);
    const componentSizes = await db.select().from(sizes).where(eq(sizes.productId, componentProduct.id));
    const mappedSizes: SizeQuantity[] = [];
    for (const requested of requestedSizes) {
      if (!requested.sizeId) {
        mappedSizes.push({ sizeId: null, quantity: requested.quantity });
        continue;
      }
      const bundleSize = bundleSizeById.get(requested.sizeId);
      const componentSizeId = component.sizeMode === "fixed"
        ? component.componentSizeId
        : componentSizes.find((size) => size.label === bundleSize?.label)?.id;
      if (!componentSizeId) {
        throw new Error(`El componente "${componentProduct.name}" no tiene un talle equivalente a "${bundleSize?.label ?? "el talle solicitado"}".`);
      }
      mappedSizes.push({ sizeId: componentSizeId, quantity: requested.quantity });
    }
    const componentQuote = await quoteOrder({
      lines: [{ productId: componentProduct.id, quantity: line.quantity, sizeQuantities: mappedSizes }],
      urgent,
      pricingRuleId,
    });
    const componentLine = componentQuote.lines[0];
    if (!componentLine) throw new Error(`No se pudo cotizar el componente "${componentProduct.name}".`);
    for (const [index, group] of groups.entries()) {
      const componentGroup = componentLine.sizeBreakdown[index];
      if (!componentGroup) throw new Error(`El componente "${componentProduct.name}" no tiene desglose para el talle solicitado.`);
      const componentQuantity = Number(component.quantity);
      group.unitCost += componentGroup.unitCost * componentQuantity;
      for (const material of componentGroup.materials) {
        const totalQuantity = material.totalQuantity * componentQuantity;
        const previous = group.materials.get(material.materialId ?? material.name);
        if (previous) previous.totalQuantity += totalQuantity;
        else group.materials.set(material.materialId ?? material.name, { ...material, totalQuantity });
      }
      for (const detail of componentGroup.consumption ?? []) {
        group.consumption.push({ ...detail, sourceProductId: componentProduct.id, sourceProductName: componentProduct.name, sizeId: group.sizeId, sizeLabel: group.sizeLabel, totalQuantity: detail.totalQuantity * componentQuantity });
      }
    }
    for (const material of componentLine.materials) {
      const totalQuantity = material.totalQuantity * Number(component.quantity);
      const previous = lineMaterials.get(material.materialId ?? material.name);
      if (previous) previous.totalQuantity += totalQuantity;
      else lineMaterials.set(material.materialId ?? material.name, { ...material, totalQuantity });
    }
    for (const technique of componentLine.techniques) {
      if (!techniquesById.has(technique.id)) techniquesById.set(technique.id, technique);
    }
  }

  const surcharge = urgent ? rule.urgentSurcharge / 100 : 0;
  let lineCost = 0;
  let linePrice = 0;
  for (const group of groups) {
    group.unitPrice = line.overrideUnitPrice ?? roundToStep(group.unitCost * (1 + rule.marginPercent / 100) * (1 + surcharge), rule.rounding);
    group.subtotal = group.unitPrice * group.quantity;
    lineCost += group.unitCost * group.quantity;
    linePrice += group.subtotal;
  }
  return {
    orderLineId: line.orderLineId,
    productId: product.id,
    productName: product.name,
    quantity: line.quantity,
    unitCost: round2(lineCost / line.quantity),
    unitPrice: round2(linePrice / line.quantity),
    subtotal: round2(linePrice),
    materials: [...lineMaterials.values()].map((material) => ({ ...material, totalQuantity: round3(material.totalQuantity) })),
    techniques: [...techniquesById.values()],
    bundleComponents: components.map((component) => ({ productId: component.componentProductId, productName: componentById.get(component.componentProductId)?.name ?? "Componente", quantity: Number(component.quantity) })),
    sizeBreakdown: groups.map((group) => ({
      sizeId: group.sizeId,
      sizeLabel: group.sizeLabel,
      quantity: group.quantity,
      unitCost: round2(group.unitCost),
      unitPrice: round2(group.unitPrice),
      subtotal: round2(group.subtotal),
      materials: [...group.materials.values()].map((material) => ({ ...material, totalQuantity: round3(material.totalQuantity) })),
      consumption: group.consumption,
    })),
  };
}

function roundToStep(value: number, step: number) { return !step || step <= 0 ? round2(value) : Math.round(value / step) * step; }
function round2(value: number) { return Math.round(value * 100) / 100; }
function round3(value: number) { return Math.round(value * 1000) / 1000; }
function round4(value: number) { return Math.round(value * 10000) / 10000; }

export async function listSizesForProduct(productId: string) { return db.select().from(sizes).where(eq(sizes.productId, productId)); }
export async function listTechniques() { return db.select().from(techniques).where(eq(techniques.active, true)); }
export async function listMaterials() { return db.select().from(materials).where(eq(materials.active, true)); }
export async function listProducts() { return db.select().from(products).where(eq(products.active, true)); }
export async function getOrderLine(id: string) { return db.select().from(orderLines).where(eq(orderLines.id, id)).limit(1); }
