"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Field, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { GARMENT_FAMILIES, GARMENT_TYPES, GARMENT_TYPES_BY_FAMILY, labelGarmentFamily, labelGarmentType } from "@/lib/garments";
import { PRODUCT_TAXONOMY, type ProductTaxonomyCategory } from "@/lib/product-taxonomy";

const COMMON_ZONES = [
  "Pecho izquierdo",
  "Pecho central",
  "Pecho derecho",
  "Manga izquierda",
  "Manga derecha",
  "Espalda alta",
  "Espalda baja",
  "Espalda central",
  "Pierna izquierda",
  "Pierna derecha",
  "Frente completo",
];

type ProductInitial = {
  id?: string;
  sku?: string | null;
  name?: string | null;
  category?: string | null;
  description?: string | null;
  basePrice?: string | null;
  minOrder?: number | null;
  zones?: string[] | null;
  productKind?: "garment" | "bundle" | null;
  productCategory?: string | null;
  productSubcategory?: string | null;
  productType?: string | null;
  garmentFamily?: (typeof GARMENT_FAMILIES)[number] | null;
  garmentType?: (typeof GARMENT_TYPES)[number] | null;
  moldId?: string | null;
  bundleItems?: Array<{ componentProductId: string; quantity: string | number; sizeMode: "same_label" | "fixed"; componentSizeId?: string | null }>;
};

type Mold = { id: string; name: string; family: string; measurementSchema: { required: string[]; optional: string[] } };
type ComponentProduct = { id: string; sku: string; name: string; productKind: "garment" | "bundle" };

export function ProductoForm({ initial, molds = [], componentProducts = [], taxonomy = PRODUCT_TAXONOMY }: { initial?: ProductInitial; molds?: Mold[]; componentProducts?: ComponentProduct[]; taxonomy?: ProductTaxonomyCategory[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [zones, setZones] = useState<string[]>(initial?.zones ?? ["Pecho izquierdo", "Espalda alta"]);
  const [productKind, setProductKind] = useState<"garment" | "bundle">(initial?.productKind ?? "garment");
  const [productCategory, setProductCategory] = useState(initial?.productCategory ?? "indumentaria");
  const [productSubcategory, setProductSubcategory] = useState(initial?.productSubcategory ?? "prendas");
  const [productType, setProductType] = useState(initial?.productType ?? "remera");
  const [usesGarmentLogic, setUsesGarmentLogic] = useState(initial ? Boolean(initial.garmentFamily || initial.garmentType) : true);
  const [garmentFamily, setGarmentFamily] = useState<(typeof GARMENT_FAMILIES)[number] | null>(initial?.garmentFamily ?? "parte_superior");
  const [garmentType, setGarmentType] = useState<(typeof GARMENT_TYPES)[number] | null>(initial?.garmentType ?? "remera");
  const [moldId, setMoldId] = useState(initial?.moldId ?? "");
  const [bundleItems, setBundleItems] = useState(initial?.bundleItems?.map((item) => ({ ...item, quantity: String(item.quantity) })) ?? []);
  const selectedCategory = taxonomy.find((category) => category.value === productCategory);
  const selectedSubcategory = selectedCategory?.subcategories.find((subcategory) => subcategory.value === productSubcategory);

  function changeCategory(value: string) {
    setProductCategory(value);
    const next = taxonomy.find((category) => category.value === value)?.subcategories[0];
    if (next) {
      setProductSubcategory(next.value);
      setProductType(next.types[0]?.value ?? "otro");
    }
  }

  function changeSubcategory(value: string) {
    setProductSubcategory(value);
    const next = taxonomy.find((category) => category.value === productCategory)?.subcategories.find((subcategory) => subcategory.value === value);
    if (next?.types[0]) setProductType(next.types[0].value);
  }

  function toggleZone(z: string) {
    setZones((prev) => (prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      ...Object.fromEntries(form.entries()),
      zones,
      productKind,
      productCategory,
      productSubcategory,
      productType,
      garmentFamily: usesGarmentLogic ? garmentFamily : null,
      garmentType: usesGarmentLogic ? garmentType : null,
      moldId: moldId || null,
      bundleItems: productKind === "bundle" ? bundleItems.map((item) => ({ ...item, quantity: Number(item.quantity), componentSizeId: item.componentSizeId ?? null })) : [],
      basePrice: Number(form.get("basePrice")),
      minOrder: Number(form.get("minOrder") ?? 1),
    };
    startTransition(async () => {
      const res = await fetch(initial ? `/api/products/${initial.id}` : "/api/products", {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error guardando");
        return;
      }
      const data = await res.json();
      router.push(`/admin/productos/${data.id}`);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-2xl">
      <Field label="SKU"><Input name="sku" required defaultValue={initial?.sku ?? ""} placeholder="CAM-SUB-001" /></Field>
      <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
        <p className="text-sm font-semibold text-on-surface">Clasificación general</p>
        <p className="text-xs text-on-surface-variant">Elegí una ruta del catálogo. Podés actualizar las opciones desde Configuración → Catálogo.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Categoría"><Select value={productCategory} onChange={(e) => changeCategory(e.target.value)} required><option value="">Elegir categoría...</option>{taxonomy.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</Select></Field>
          <Field label="Subcategoría"><Select value={productSubcategory} onChange={(e) => changeSubcategory(e.target.value)} required disabled={!selectedCategory}><option value="">Elegir subcategoría...</option>{(selectedCategory?.subcategories ?? []).map((subcategory) => <option key={subcategory.value} value={subcategory.value}>{subcategory.label}</option>)}</Select></Field>
          <Field label="Tipo general"><Select value={productType} onChange={(e) => setProductType(e.target.value)} required disabled={!selectedSubcategory}><option value="">Elegir tipo...</option>{(selectedSubcategory?.types ?? []).map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</Select></Field>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Tipo de producto">
          <Select value={productKind} onChange={(e) => {
            const next = e.target.value as "garment" | "bundle";
            setProductKind(next);
            if (next === "bundle") {
              setProductCategory("indumentaria");
              setProductSubcategory("conjuntos");
              setProductType("conjunto");
              setUsesGarmentLogic(false);
              setGarmentFamily(null);
              setGarmentType(null);
              setMoldId("");
            } else if (productType === "conjunto") {
              setProductCategory("indumentaria");
              setProductSubcategory("prendas");
              setProductType("remera");
            }
          }}>
            <option value="garment">Producto individual</option>
            <option value="bundle">Conjunto / kit</option>
          </Select>
        </Field>
        <Field label="Lógica específica de prenda">
          <label className="flex items-center gap-2 min-h-[42px] text-sm text-on-surface">
            <input type="checkbox" checked={usesGarmentLogic} disabled={productKind === "bundle"} onChange={(e) => {
              const checked = e.target.checked;
              setUsesGarmentLogic(checked);
              if (!checked) { setGarmentFamily(null); setGarmentType(null); setMoldId(""); }
              else { setGarmentFamily("parte_superior"); setGarmentType("remera"); }
            }} />
            Usar familia y molde
          </label>
        </Field>
        <Field label="Molde"><p className="text-sm text-on-surface-variant py-2">{usesGarmentLogic ? "Opcional" : "No aplica"}</p></Field>
      </div>
      {usesGarmentLogic && productKind !== "bundle" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Familia de prenda">
            <Select value={garmentFamily ?? "parte_superior"} onChange={(e) => { const family = e.target.value as (typeof GARMENT_FAMILIES)[number]; setGarmentFamily(family); setGarmentType(GARMENT_TYPES_BY_FAMILY[family][0] ?? null); setMoldId(""); }}>
              {GARMENT_FAMILIES.map((family) => <option key={family} value={family}>{labelGarmentFamily(family)}</option>)}
            </Select>
          </Field>
          <Field label="Tipo / modelo">
              <Select value={garmentType ?? "remera"} onChange={(e) => setGarmentType(e.target.value as typeof garmentType)}>
              {(GARMENT_TYPES_BY_FAMILY[garmentFamily ?? "parte_superior"] ?? GARMENT_TYPES.filter((type) => type !== "conjunto")).map((type) => <option key={type} value={type}>{labelGarmentType(type)}</option>)}
            </Select>
          </Field>
          <Field label="Molde base reutilizable" hint="Opcional. Remera, chomba y camiseta pueden compartirlo; las recetas siguen siendo independientes.">
            <Select value={moldId} onChange={(e) => setMoldId(e.target.value)}>
              <option value="">Sin molde asignado</option>
              {molds.filter((mold) => mold.family === garmentFamily).map((mold) => <option key={mold.id} value={mold.id}>{mold.name}</option>)}
            </Select>
          </Field>
        </div>
      )}
      {productKind === "bundle" && (
        <Field label="Componentes del conjunto" hint="Cada componente reutiliza su propio producto, talles y receta. El modo mismo talle busca la misma etiqueta de talle.">
          <div className="space-y-2">
            {bundleItems.map((item, index) => (
              <div key={`${item.componentProductId}-${index}`} className="grid grid-cols-[1fr_5rem_auto] gap-2 items-center">
                <Select value={item.componentProductId} onChange={(e) => setBundleItems((current) => current.map((row, i) => i === index ? { ...row, componentProductId: e.target.value } : row))}>
                  <option value="">Elegir prenda...</option>
                  {componentProducts.filter((product) => product.id !== initial?.id && product.productKind === "garment").map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
                </Select>
                <Input type="number" min="0.01" step="0.01" value={item.quantity} onChange={(e) => setBundleItems((current) => current.map((row, i) => i === index ? { ...row, quantity: e.target.value } : row))} aria-label="Cantidad del componente" />
                <Button type="button" variant="ghost" size="sm" onClick={() => setBundleItems((current) => current.filter((_, i) => i !== index))}>Quitar</Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={() => setBundleItems((current) => [...current, { componentProductId: "", quantity: "1", sizeMode: "same_label", componentSizeId: null }])}>+ Agregar componente</Button>
          </div>
        </Field>
      )}
      <Field label="Nombre"><Input name="name" required defaultValue={initial?.name ?? ""} placeholder="Camiseta deportiva manga corta" /></Field>
      <Field label="Descripción"><Textarea name="description" rows={3} defaultValue={initial?.description ?? ""} /></Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Precio base (referencia)" hint="NO define el precio de venta: lo calcula la receta + margen al cotizar">
          <Input name="basePrice" type="number" step="0.01" defaultValue={initial?.basePrice ?? "0"} />
        </Field>
        <Field label="Pedido mínimo"><Input name="minOrder" type="number" min={1} defaultValue={initial?.minOrder ?? 1} /></Field>
      </div>
      <Field label="Zonas válidas (clic para toggle)">
        <div className="flex flex-wrap gap-2">
          {COMMON_ZONES.map((z) => (
            <button
              type="button"
              key={z}
              onClick={() => toggleZone(z)}
              className={`px-2.5 py-1 rounded border text-xs transition-colors ${zones.includes(z) ? "bg-primary/20 border-primary text-primary" : "bg-transparent border-outline-variant text-on-surface-variant hover:border-primary"}`}
            >
              {z}
            </button>
          ))}
        </div>
        <p className="text-xs text-on-surface-variant mt-2">Estas zonas se ofrecerán al cargar aplicaciones sobre prendas de este producto.</p>
      </Field>
      {error && <p className="text-sm text-error">{error}</p>}
      <div className="flex justify-end gap-2 pt-4 border-t border-outline-variant">
        <Button type="submit" disabled={pending}>{pending ? "Guardando..." : initial ? "Guardar cambios" : "Crear producto"}</Button>
      </div>
    </form>
  );
}
