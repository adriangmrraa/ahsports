"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Input";
import { Table, THead, TH, TR, TD } from "@/components/ui/Table";
import { Plus, X, ChevronDown } from "lucide-react";
import type { bomItems, bomRecipes, materials, sizes, techniques } from "@/db/schema";
import { consumptionUnit } from "@/lib/consumption";

type Recipe = typeof bomRecipes.$inferSelect;
type Item = typeof bomItems.$inferSelect;
type Technique = typeof techniques.$inferSelect;
type Size = typeof sizes.$inferSelect;
type Material = typeof materials.$inferSelect;
type ConsumptionMode = "direct" | "yield";
type ItemForm = { materialId: string; consumptionMode: ConsumptionMode; directQuantity: string; unitsPerConsumptionUnit: string; wastePercent: string };

const GENERAL_KEY = "__general__";

export function RecetasEditor({
  productId,
  recipes,
  items,
  techniques,
  sizes,
  materials,
}: {
  productId: string;
  recipes: Recipe[];
  items: Item[];
  techniques: Technique[];
  sizes: Size[];
  materials: Material[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [newTechniqueId, setNewTechniqueId] = useState("");
  const [newSizeId, setNewSizeId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [itemForm, setItemForm] = useState<Record<string, ItemForm>>({});
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);

  const materialById = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const sizeById = useMemo(() => new Map(sizes.map((s) => [s.id, s.label])), [sizes]);
  const techniqueById = useMemo(() => new Map(techniques.map((t) => [t.id, t.name])), [techniques]);
  const itemsByRecipe = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const list = map.get(item.recipeId) ?? [];
      list.push(item);
      map.set(item.recipeId, list);
    }
    return map;
  }, [items]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; recipes: Recipe[] }>();
    for (const recipe of recipes) {
      const key = recipe.techniqueId ?? GENERAL_KEY;
      const existing = map.get(key);
      if (existing) {
        existing.recipes.push(recipe);
      } else {
        map.set(key, {
          key,
          label: recipe.techniqueId ? (techniqueById.get(recipe.techniqueId) ?? "Técnica eliminada") : "Receta general",
          recipes: [recipe],
        });
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [recipes, techniqueById]);

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }

  function formFor(recipeId: string) {
    return itemForm[recipeId] ?? { materialId: "", consumptionMode: "direct", directQuantity: "", unitsPerConsumptionUnit: "", wastePercent: "0" };
  }

  function setForm(recipeId: string, patch: Partial<ItemForm>) {
    setItemForm((prev) => ({ ...prev, [recipeId]: { ...formFor(recipeId), ...patch } }));
  }

  function editItem(recipeId: string, item: Item) {
    setEditingItemId(item.id);
    setEditingRecipeId(recipeId);
    setForm(recipeId, {
      materialId: item.materialId,
      consumptionMode: item.consumptionMode,
      directQuantity: item.directQuantity ?? (item.consumptionMode === "direct" ? item.quantity : ""),
      unitsPerConsumptionUnit: item.unitsPerConsumptionUnit ?? "",
      wastePercent: item.wastePercent,
    });
  }

  async function createRecipe(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          techniqueId: newTechniqueId || null,
          sizeId: newSizeId || null,
          notes: newNotes || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error creando receta");
        return;
      }
      setNewTechniqueId("");
      setNewSizeId("");
      setNewNotes("");
      router.refresh();
    });
  }

  async function addItem(e: React.FormEvent<HTMLFormElement>, recipeId: string) {
    e.preventDefault();
    setError(null);
    const form = formFor(recipeId);
    if (!form.materialId) {
      setError("Elegí un material para agregar al BOM");
      return;
    }
    startTransition(async () => {
      const res = await fetch(`/api/recipes/${recipeId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: form.materialId,
          consumptionMode: form.consumptionMode,
          directQuantity: form.consumptionMode === "direct" ? Number(form.directQuantity) : null,
          unitsPerConsumptionUnit: form.consumptionMode === "yield" ? Number(form.unitsPerConsumptionUnit) : null,
          wastePercent: Number(form.wastePercent || 0),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error agregando item");
        return;
      }
      setItemForm((prev) => ({ ...prev, [recipeId]: { materialId: "", consumptionMode: "direct", directQuantity: "", unitsPerConsumptionUnit: "", wastePercent: "0" } }));
      router.refresh();
    });
  }

  async function updateItem(e: React.FormEvent<HTMLFormElement>, recipeId: string) {
    e.preventDefault();
    if (!editingItemId) return;
    const form = formFor(recipeId);
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/recipes/items/${editingItemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: form.materialId,
          consumptionMode: form.consumptionMode,
          directQuantity: form.consumptionMode === "direct" ? Number(form.directQuantity) : null,
          unitsPerConsumptionUnit: form.consumptionMode === "yield" ? Number(form.unitsPerConsumptionUnit) : null,
          wastePercent: Number(form.wastePercent || 0),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error editando item");
        return;
      }
      setEditingItemId(null);
      setEditingRecipeId(null);
      setItemForm((prev) => ({ ...prev, [recipeId]: { materialId: "", consumptionMode: "direct", directQuantity: "", unitsPerConsumptionUnit: "", wastePercent: "0" } }));
      router.refresh();
    });
  }

  async function removeItem(itemId: string, materialName: string) {
    if (!confirm(`Quitar "${materialName}" de la receta?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/recipes/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error ?? "Error quitando item");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createRecipe} className="space-y-4 p-4 bg-surface-container-low rounded-md border border-outline-variant">
        <p className="label-caps text-on-surface-variant">Nueva receta</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Técnica">
            <Select value={newTechniqueId} onChange={(e) => setNewTechniqueId(e.target.value)}>
              <option value="">General (sin técnica)</option>
              {techniques.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.active ? "" : " (inactiva)"}</option>
              ))}
            </Select>
          </Field>
          <Field label="Talle (opcional)">
            <Select value={newSizeId} onChange={(e) => setNewSizeId(e.target.value)}>
              <option value="">Todos los talles</option>
              {sizes.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notas (opcional)">
            <Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Ej: Camiseta M sublimada full" />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            <Plus className="w-4 h-4" /> {pending ? "Creando..." : "Crear receta"}
          </Button>
        </div>
      </form>

      {error && <p className="text-sm text-error">{error}</p>}

      {recipes.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-6 text-center">
          Sin recetas para este producto. Creá la primera con el form de arriba.
        </p>
      ) : (
        groups.map((group) => {
          const open = openGroups[group.key] ?? true;
          return (
            <div key={group.key} className="border border-outline-variant rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                className="w-full flex items-center justify-between px-4 py-3 bg-surface-container text-on-surface hover:text-primary transition-colors"
              >
                <span className="font-headline text-base">
                  {group.label} · {group.recipes.length} {group.recipes.length === 1 ? "receta" : "recetas"}
                </span>
                <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              {open && (
                <div className="p-4 space-y-4">
                  {group.recipes.map((recipe) => {
                    const recipeItems = itemsByRecipe.get(recipe.id) ?? [];
                    const sizeLabel = recipe.sizeId ? (sizeById.get(recipe.sizeId) ?? "Talle eliminado") : null;
                    const form = formFor(recipe.id);
                    return (
                      <div key={recipe.id} className="p-4 bg-surface-container-low rounded-md border border-outline-variant space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-on-surface">
                            {sizeLabel ? `Talle ${sizeLabel}` : "Todos los talles"}
                          </span>
                          <span className="text-xs text-on-surface-variant data-mono">
                            · {recipeItems.length} {recipeItems.length === 1 ? "item" : "items"}
                          </span>
                          {recipe.notes && <span className="text-xs text-on-surface-variant">· {recipe.notes}</span>}
                        </div>

                        {recipeItems.length === 0 ? (
                          <p className="text-sm text-on-surface-variant">Sin items en esta receta.</p>
                        ) : (
                          <Table>
                            <THead>
                              <tr>
                                <TH>Material</TH>
                                <TH align="right">Consumo</TH>
                                <TH align="right">Método</TH>
                                <TH align="right">Merma %</TH>
                                <TH align="right">Acciones</TH>
                              </tr>
                            </THead>
                            <tbody>
                              {recipeItems.map((item) => {
                                const material = materialById.get(item.materialId);
                                const isEditing = editingItemId === item.id && editingRecipeId === recipe.id;
                                return (
                                  <TR key={item.id}>
                                    <TD className="text-on-surface">
                                      {material?.name ?? "Material eliminado"}
                                      {material && <span className="block text-xs text-on-surface-variant">{material.unit}</span>}
                                    </TD>
                                    <TD align="right">
                                      {item.consumptionMode === "yield"
                                        ? `1 ${material ? consumptionUnit(material.unit) : "unidad"} / ${item.unitsPerConsumptionUnit} prendas`
                                        : `${item.directQuantity ?? item.quantity} ${material ? consumptionUnit(material.unit) : "unidad"} / prenda`}
                                    </TD>
                                    <TD align="right" className="text-xs">{item.consumptionMode === "yield" ? "Rendimiento" : "Directo"}</TD>
                                    <TD align="right">{item.wastePercent}%</TD>
                                    <TD align="right">
                                      <Button variant="ghost" size="sm" disabled={pending} onClick={() => {
                                        if (isEditing) {
                                          setEditingItemId(null);
                                          setEditingRecipeId(null);
                                        } else {
                                          editItem(recipe.id, item);
                                        }
                                      }}>
                                        {isEditing ? "Cancelar" : "Editar"}
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        disabled={pending}
                                        onClick={() => removeItem(item.id, material?.name ?? "item")}
                                        title="Quitar item"
                                      >
                                        <X className="w-4 h-4" />
                                      </Button>
                                    </TD>
                                  </TR>
                                );
                              })}
                            </tbody>
                          </Table>
                        )}

                        <form onSubmit={(e) => editingItemId && editingRecipeId === recipe.id ? updateItem(e, recipe.id) : addItem(e, recipe.id)} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end pt-2 border-t border-outline-variant">
                          <div className="md:col-span-4">
                            <Field label="Material" hint="La cantidad usa la unidad del material; kilo se normaliza a metro">
                              <Select value={form.materialId} onChange={(e) => setForm(recipe.id, { materialId: e.target.value })}>
                                <option value="">Elegir material...</option>
                                {materials.map((m) => (
                                  <option key={m.id} value={m.id}>{m.name} · {m.unit === "kilo" ? "kilo (consumo en metros)" : m.unit}</option>
                                ))}
                              </Select>
                            </Field>
                          </div>
                          <div className="md:col-span-3">
                            <Field label="Método">
                              <Select value={form.consumptionMode} onChange={(e) => setForm(recipe.id, { consumptionMode: e.target.value as ConsumptionMode })}>
                                <option value="direct">Directo: cantidad por prenda</option>
                                <option value="yield">Rendimiento: prendas por unidad</option>
                              </Select>
                            </Field>
                          </div>
                          <div className="md:col-span-2">
                            <Field label={form.consumptionMode === "direct" ? `Cantidad por prenda${(() => { const sel = materialById.get(form.materialId); return sel ? ` (${sel.unit === "kilo" ? "metro" : sel.unit})` : ""; })()}` : "Prendas por unidad"}>
                              <Input
                                type="number"
                                step="0.001"
                                min="0.001"
                                required
                                value={form.consumptionMode === "direct" ? form.directQuantity : form.unitsPerConsumptionUnit}
                                onChange={(e) => setForm(recipe.id, form.consumptionMode === "direct" ? { directQuantity: e.target.value } : { unitsPerConsumptionUnit: e.target.value })}
                                placeholder={form.consumptionMode === "direct" ? "0.8" : "2"}
                              />
                            </Field>
                          </div>
                          <div className="md:col-span-1">
                            <Field label="Merma %">
                              <Input
                                type="number"
                                step="0.1"
                                min="0"
                                max="100"
                                value={form.wastePercent}
                                onChange={(e) => setForm(recipe.id, { wastePercent: e.target.value })}
                                placeholder="0"
                              />
                            </Field>
                          </div>
                          <div className="md:col-span-2">
                            <Button type="submit" size="sm" disabled={pending} className="w-full">
                              <Plus className="w-3 h-3" /> {editingItemId && editingRecipeId === recipe.id ? "Guardar cambio" : "Agregar"}
                            </Button>
                          </div>
                        </form>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
