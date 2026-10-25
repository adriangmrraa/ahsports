/**
 * Operator catalog tools — gate + domain invariants.
 *
 * Covers the task-required behaviors:
 *  - BOM upsert computes unit cost (materials + technique costPerUnit) and
 *    only writes after CONFIRM;
 *  - volume-tier validation (duplicates rejected, unsorted input sorted);
 *  - sublimation invariant: a technique that requires sublimable fabric with
 *    no sublimable fabric enabled surfaces a loud warning in the preview;
 *  - every mutation returns { pending: true, token } first and touches no
 *    catalog table until executePendingAction runs.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- modules must load after the @/db hook */
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  bomItems,
  bomRecipes,
  fabrics,
  materials,
  pricingRules,
  productFabrics,
  products,
  techniques,
} from "@/db/schema";
import type { AgentToolContext } from "@/lib/agents/tools/types";

import { FakeDb, installFakeDb, installModuleIntercepts } from "../messaging/test-support/fake-db";

const fake = new FakeDb();
installFakeDb(fake);

installModuleIntercepts({
  "@/lib/telegram/notifier": () => ({
    notifyOperators: async () => ({ ok: true, delivered: 0, failed: 0 }),
  }),
});

const { executePendingAction } = require("./confirmations") as typeof import("./confirmations");
const { previewRecipeCostTool, upsertBomRecipeTool, addRecipeItemTool } =
  require("./tools-recipes") as typeof import("./tools-recipes");
const { setProductVolumeTiersTool, setProductTechniquesTool, getProductOptionsTool } =
  require("./tools-product-options") as typeof import("./tools-product-options");

const context: AgentToolContext = { actorRef: "operator-1" };

const seedCatalog = () => {
  fake.seed(products, [
    {
      id: "p1",
      sku: "REM-1",
      name: "Remera Lisa",
      productKind: "garment",
      productCategory: "indumentaria",
      productSubcategory: "prendas",
      productType: "otro",
      basePrice: "5000",
      minOrder: 1,
      zones: [],
      active: true,
    },
  ]);
  fake.seed(materials, [
    { id: "m1", name: "Algodón peinado", category: "tela", unit: "metro", unitPrice: "1200", metersPerKilo: null, active: true },
    { id: "m2", name: "Hilo tex 24", category: "hilo", unit: "unidad", unitPrice: "50", active: true },
  ]);
  fake.seed(techniques, [
    { id: "t1", name: "Sublimado", costPerUnit: "800", costPerSquareMeter: "0", setupCost: "0", requiresSublimableFabric: true, active: true },
    { id: "t2", name: "DTF", costPerUnit: "300", costPerSquareMeter: "0", setupCost: "0", requiresSublimableFabric: false, active: true },
  ]);
  fake.seed(fabrics, [
    { id: "f1", name: "Piqué", sublimable: false, priceModifier: "0", sortOrder: 0, active: true },
    { id: "f2", name: "Set deportivo", sublimable: true, priceModifier: "500", sortOrder: 1, active: true },
  ]);
  // Only a NON-sublimable fabric is enabled on the product.
  fake.seed(productFabrics, [{ id: "pf1", productId: "p1", fabricId: "f1", priceModifier: "0" }]);
  fake.seed(pricingRules, [{ id: "rule1", name: "default", marginPercent: "40", rounding: "100", active: true }]);
};

beforeEach(() => {
  fake.reset();
  seedCatalog();
});

describe("previewRecipeCost — recipe math without writing", () => {
  it("computes material + technique unit cost and the margin-priced suggestion", async () => {
    const result = (await previewRecipeCostTool.handler(
      {
        items: [
          { material: "Algodón", quantity: 1.5, wastePercent: 10 },
          { material: "Hilo tex 24", quantity: 1 },
        ],
        technique: "Sublimado",
      },
      context,
    )) as {
      ok: boolean;
      materialUnitCost: number;
      techniqueCostPerUnit: number;
      unitCost: number;
      pricing: { suggestedUnitPrice: number };
    };

    assert.equal(result.ok, true);
    // 1.5m × 1.10 waste = 1.65m × $1200 = $1980; hilo 1 × $50 = $50.
    assert.equal(result.materialUnitCost, 2030);
    assert.equal(result.techniqueCostPerUnit, 800);
    assert.equal(result.unitCost, 2830);
    // 2830 × 1.4 margin = 3962 → rounded to 100 = 4000.
    assert.equal(result.pricing.suggestedUnitPrice, 4000);
    assert.equal(fake.writes.length, 0, "a cost preview must not write");
  });
});

describe("upsertBomRecipe — two-step gate", () => {
  it("first call only previews; CONFIRM writes the recipe and returns the computed cost", async () => {
    const args = {
      product: "Remera Lisa",
      technique: "DTF",
      items: [{ material: "Algodón", quantity: 2 }],
    };
    const pending = (await upsertBomRecipeTool.handler(args, context)) as {
      pending: boolean;
      token: string;
      preview: { action: string; unitCost: number };
    };

    assert.equal(pending.pending, true);
    assert.match(pending.token, /^[0-9a-f]{10}$/);
    assert.equal(pending.preview.action, "crear");
    assert.equal(pending.preview.unitCost, 2700); // 2m × $1200 + $300 DTF
    assert.equal(fake.rows("bom_recipes").length, 0, "nothing may write before CONFIRM");
    assert.equal(fake.rows("bom_items").length, 0);

    const executed = await executePendingAction(pending.token);
    assert.equal(executed.ok, true);
    if (executed.ok) {
      const result = executed.result as { recipeId: string; unitCost: number };
      assert.equal(result.unitCost, 2700);
      assert.equal(fake.rows("bom_recipes").length, 1);
      assert.equal(fake.rows("bom_items").length, 1);
      assert.equal(fake.rows("bom_recipes")[0].id, result.recipeId);
    }
  });

  it("confirming twice never double-writes (token is single-use)", async () => {
    const args = { product: "REM-1", items: [{ material: "Algodón", quantity: 1 }] };
    const { token } = (await upsertBomRecipeTool.handler(args, context)) as { token: string };
    await executePendingAction(token);
    const replay = await executePendingAction(token);
    assert.equal(replay.ok, false);
    assert.equal(fake.rows("bom_recipes").length, 1);
  });
});

describe("addRecipeItem — incremental BOM edit", () => {
  it("adds an item to an existing recipe located by product+technique", async () => {
    fake.seed(bomRecipes, [{ id: "r1", productId: "p1", sizeId: null, techniqueId: "t2", notes: null }]);
    fake.seed(bomItems, [
      {
        id: "bi1",
        recipeId: "r1",
        materialId: "m1",
        consumptionMode: "direct",
        quantity: "2",
        directQuantity: "2",
        unitsPerConsumptionUnit: null,
        wastePercent: "0",
      },
    ]);

    const pending = (await addRecipeItemTool.handler(
      { product: "Remera Lisa", technique: "DTF", item: { material: "Hilo tex 24", quantity: 3 } },
      context,
    )) as { pending: boolean; token: string };
    assert.equal(pending.pending, true);
    assert.equal(fake.rows("bom_items").length, 1, "preview must not insert");

    const executed = await executePendingAction(pending.token);
    assert.equal(executed.ok, true);
    assert.equal(fake.rows("bom_items").length, 2);
    assert.equal(fake.rows("bom_items")[1].materialId, "m2");
  });
});

describe("setProductVolumeTiers — ladder validation", () => {
  it("rejects duplicate minQty before queueing anything", async () => {
    const result = (await setProductVolumeTiersTool.handler(
      { product: "Remera Lisa", tiers: [{ minQty: 50, discountPct: 10 }, { minQty: 50, discountPct: 20 }] },
      context,
    )) as { ok?: boolean; error?: string; pending?: boolean };
    assert.equal(result.ok, false);
    assert.equal(result.error, "duplicate_min_qty");
    assert.equal(result.pending, undefined);
    assert.equal(fake.rows("product_volume_tiers").length, 0);
  });

  it("sorts unsorted tiers and shows the discounted base price in the preview", async () => {
    const pending = (await setProductVolumeTiersTool.handler(
      { product: "Remera Lisa", tiers: [{ minQty: 100, discountPct: 15 }, { minQty: 50, discountPct: 10 }] },
      context,
    )) as { pending: boolean; preview: { tiers: Array<{ minQty: number; exampleUnitPriceOnBase: number }> } };

    assert.equal(pending.pending, true);
    assert.deepEqual(
      pending.preview.tiers.map((tier) => tier.minQty),
      [50, 100],
    );
    assert.equal(pending.preview.tiers[0].exampleUnitPriceOnBase, 4500); // 5000 − 10%
    assert.equal(pending.preview.tiers[1].exampleUnitPriceOnBase, 4250); // 5000 − 15%
  });
});

describe("sublimation invariant — loud warnings in previews", () => {
  it("warns when enabling a sublimation technique on a product with no sublimable fabric", async () => {
    const pending = (await setProductTechniquesTool.handler(
      { product: "Remera Lisa", techniques: [{ technique: "Sublimado" }] },
      context,
    )) as { pending: boolean; preview: { warnings: string[] } };

    assert.equal(pending.pending, true);
    assert.equal(pending.preview.warnings.length, 1);
    assert.match(pending.preview.warnings[0], /NINGUNA tela sublimable/);
  });

  it("does not warn when a sublimable fabric is enabled", async () => {
    fake.seed(productFabrics, [
      { id: "pf1", productId: "p1", fabricId: "f1", priceModifier: "0" },
      { id: "pf2", productId: "p1", fabricId: "f2", priceModifier: "0" },
    ]);
    const pending = (await setProductTechniquesTool.handler(
      { product: "Remera Lisa", techniques: [{ technique: "Sublimado" }] },
      context,
    )) as { pending: boolean; preview: { warnings: string[] } };
    assert.equal(pending.pending, true);
    assert.equal(pending.preview.warnings.length, 0);
  });
});

describe("getProductOptions — read-only matrix", () => {
  it("returns fabrics, techniques and tiers without writing", async () => {
    const result = (await getProductOptionsTool.handler({ product: "Remera Lisa" }, context)) as {
      ok: boolean;
      fabrics: Array<{ name: string; sublimable: boolean }>;
      techniques: unknown[];
      volumeTiers: unknown[];
    };
    assert.equal(result.ok, true);
    assert.equal(result.fabrics.length, 1);
    assert.equal(result.fabrics[0].name, "Piqué");
    assert.equal(result.fabrics[0].sublimable, false);
    assert.equal(fake.writes.length, 0);
  });
});
