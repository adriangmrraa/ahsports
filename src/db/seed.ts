import "dotenv/config";
import { randomBytes, scryptSync } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "./client";
import {
  bomItems,
  bomRecipes,
  contacts,
  materials,
  organizations,
  pricingRules,
  products,
  sizes,
  techniques,
  users,
} from "./schema";

// NOTA: no se importa hashPassword de @/lib/auth porque ese módulo arrastra
// next/headers (solo runtime Next). Se replica el formato exacto `salt:hash`
// con scrypt 64 bytes para que verifyPassword() lo valide. Ver src/lib/auth.ts.
function hashPasswordSeed(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

async function main() {
  // 1. Limpiar todo (orden cubierto por CASCADE)
  await db.execute(sql`TRUNCATE TABLE production_events, payments, applications, attachments, order_items, order_lines, orders, bom_items, bom_recipes, sizes, products, pricing_rules, techniques, materials, contacts, organizations, sessions, users RESTART IDENTITY CASCADE`);

  // 2. Admin
  await db.insert(users).values({
    email: "admin@ahsports.com",
    passwordHash: hashPasswordSeed("admin1234"),
    name: "Admin AH Sports",
    role: "admin",
  });

  // 3. Organización demo + contacto
  const [org] = await db
    .insert(organizations)
    .values({ kind: "club", name: "Club Renacer", notes: "Cliente demo seed" })
    .returning();

  await db.insert(contacts).values({
    organizationId: org.id,
    name: "Juan Pérez",
    email: "juan@clubrenacer.com",
    phone: "+5493704567890",
    role: "Delegado",
    status: "calificado",
  });

  // 4. 6 materiales (F2-20 pedía 5; se agrega tinta porque el BOM la referencia)
  const [telaSet, _interlock, hilo, papel, tinta, _dtf] = await db
    .insert(materials)
    .values([
      { name: "Set poliéster azul", category: "Tela", unit: "metro", unitPrice: "4500", supplier: "Textil SA", gramsPerMeter: "150", metersPerKilo: "6.5", yieldPercent: "92" },
      { name: "Interlock blanco", category: "Tela", unit: "metro", unitPrice: "3800", supplier: "Textil SA", gramsPerMeter: "180", yieldPercent: "90" },
      { name: "Hilo polyester", category: "Insumo", unit: "metro", unitPrice: "12", supplier: "Hilos del Norte", yieldPercent: "100" },
      { name: "Papel sublimación A4", category: "Insumo", unit: "unidad", unitPrice: "85", supplier: "SubliMax", yieldPercent: "95" },
      { name: "Tinta sublimación", category: "Insumo", unit: "mililitro", unitPrice: "95", supplier: "SubliMax", yieldPercent: "95" },
      { name: "Film DTF", category: "Insumo", unit: "metro_cuadrado", unitPrice: "8500", supplier: "DTF Pro", yieldPercent: "90" },
    ])
    .returning();

  // 5. 5 técnicas (F2-05)
  const [sublimacion] = await db
    .insert(techniques)
    .values([
      { name: "Sublimación", costPerUnit: "0", costPerSquareMeter: "2500", setupCost: "0" },
      { name: "DTF", costPerUnit: "0", costPerSquareMeter: "4500", setupCost: "0" },
      { name: "Bordado", costPerUnit: "800", costPerSquareMeter: "0", setupCost: "2000" },
      { name: "Serigrafía", costPerUnit: "600", costPerSquareMeter: "0", setupCost: "3500" },
      { name: "Vinilo", costPerUnit: "400", costPerSquareMeter: "0", setupCost: "0" },
    ])
    .returning();

  // 6. Regla pricing activa (F2-18 — resuelve KI-06: el motor siempre tiene regla)
  await db.insert(pricingRules).values({
    name: "Estándar 2026",
    marginPercent: "40",
    urgentSurcharge: "15",
    minAdvancePercent: "50",
    rounding: "100",
    active: true,
  });

  // 7. 4 productos
  const [camiseta, short] = await db
    .insert(products)
    .values([
      { sku: "CAM-SUB-001", name: "Camiseta deportiva manga corta", category: "Camisetas", basePrice: "8500", minOrder: 10, zones: ["Pecho izquierdo", "Pecho central", "Espalda alta", "Espalda baja", "Manga izquierda", "Manga derecha"] },
      { sku: "SHO-DEP-001", name: "Short deportivo", category: "Shorts", basePrice: "6500", minOrder: 10, zones: ["Pierna izquierda", "Pierna derecha", "Espalda baja"] },
      { sku: "MUS-DEP-001", name: "Musculosa training", category: "Musculosas", basePrice: "7200", minOrder: 10, zones: ["Pecho central", "Espalda alta"] },
      { sku: "BOT-001", name: "Botinera", category: "Accesorios", basePrice: "4500", minOrder: 1, zones: ["Frente completo"] },
    ])
    .returning();

  // 8. Talles S/M/L/XL
  const insertedTalles = await db
    .insert(sizes)
    .values([
      { productId: camiseta.id, label: "S", order: 1, measurements: { ancho: 48, largo: 68, manga: 18 } },
      { productId: camiseta.id, label: "M", order: 2, measurements: { ancho: 52, largo: 72, manga: 20 } },
      { productId: camiseta.id, label: "L", order: 3, measurements: { ancho: 56, largo: 74, manga: 21 } },
      { productId: camiseta.id, label: "XL", order: 4, measurements: { ancho: 60, largo: 76, manga: 22 } },
      { productId: short.id, label: "S", order: 1, measurements: { cintura: 70, largo: 42 } },
      { productId: short.id, label: "M", order: 2, measurements: { cintura: 76, largo: 44 } },
      { productId: short.id, label: "L", order: 3, measurements: { cintura: 82, largo: 46 } },
      { productId: short.id, label: "XL", order: 4, measurements: { cintura: 88, largo: 48 } },
    ])
    .returning();
  const camisetaM = insertedTalles.find((s) => s.productId === camiseta.id && s.label === "M");
  if (!camisetaM) throw new Error("Seed: no se creó el talle M de camiseta");

  // 9. Receta BOM camiseta M sublimada
  const [receta] = await db
    .insert(bomRecipes)
    .values({ productId: camiseta.id, sizeId: camisetaM.id, techniqueId: sublimacion.id, notes: "Camiseta M sublimada full" })
    .returning();

  await db.insert(bomItems).values([
    { recipeId: receta.id, materialId: telaSet.id, quantity: "0.92", wastePercent: "8" },
    { recipeId: receta.id, materialId: hilo.id, quantity: "8", wastePercent: "0" },
    { recipeId: receta.id, materialId: papel.id, quantity: "1.05", wastePercent: "5" },
    { recipeId: receta.id, materialId: tinta.id, quantity: "0.04", wastePercent: "5" },
  ]);

  console.log("Seed completo. Login: admin@ahsports.com / admin1234");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
