export type ProductTaxonomyType = {
  value: string;
  label: string;
};

export type ProductTaxonomySubcategory = {
  value: string;
  label: string;
  types: ProductTaxonomyType[];
};

export type ProductTaxonomyCategory = {
  value: string;
  label: string;
  subcategories: ProductTaxonomySubcategory[];
};

export type ProductTaxonomyNode = {
  id: string;
  kind: "category" | "subcategory" | "type";
  value: string;
  label: string;
  parentId: string | null;
  sortOrder: number;
  active: boolean;
};

/**
 * Suggested taxonomy paths. Product fields remain text so the catalog can be
 * extended without a migration; these values are the initial vocabulary shown
 * by the product form.
 */
export const PRODUCT_TAXONOMY: ProductTaxonomyCategory[] = [
  {
    value: "indumentaria",
    label: "Indumentaria",
    subcategories: [
      {
        value: "prendas",
        label: "Prendas",
        types: [
          { value: "remera", label: "Remera" },
          { value: "chomba", label: "Chomba" },
          { value: "camiseta", label: "Camiseta" },
          { value: "campera", label: "Campera" },
          { value: "pantalon", label: "Pantalón" },
          { value: "short", label: "Short" },
          { value: "bermuda", label: "Bermuda" },
          { value: "guardapolvo", label: "Guardapolvo" },
          { value: "otro", label: "Otro" },
        ],
      },
      { value: "conjuntos", label: "Conjuntos y kits", types: [{ value: "conjunto", label: "Conjunto / kit" }] },
    ],
  },
  {
    value: "merceria",
    label: "Mercería",
    subcategories: [
      {
        value: "insumos",
        label: "Insumos y avíos",
        types: [
          { value: "tela", label: "Tela" },
          { value: "hilo", label: "Hilo" },
          { value: "cierre", label: "Cierre" },
          { value: "boton", label: "Botón" },
          { value: "elastico", label: "Elástico" },
          { value: "avio", label: "Avío" },
          { value: "otro", label: "Otro" },
        ],
      },
    ],
  },
  {
    value: "bolsos_y_mochilas",
    label: "Bolsos y mochilas",
    subcategories: [
      { value: "bolsos", label: "Bolsos", types: [{ value: "bolso", label: "Bolso" }, { value: "otro", label: "Otro" }] },
      { value: "mochilas_infantiles", label: "Mochilas infantiles", types: [{ value: "mochila_infantil", label: "Mochila infantil" }] },
    ],
  },
  {
    value: "hogar_y_jardin",
    label: "Hogar y jardín",
    subcategories: [
      { value: "manteles", label: "Manteles", types: [{ value: "mantel_jardin", label: "Mantel de jardín" }] },
      { value: "otros", label: "Otros", types: [{ value: "otro", label: "Otro" }] },
    ],
  },
  {
    value: "escolar",
    label: "Escolar",
    subcategories: [
      { value: "guardapolvos", label: "Guardapolvos", types: [{ value: "guardapolvo_jardin", label: "Guardapolvo de jardín" }] },
    ],
  },
  {
    value: "otros",
    label: "Otros productos",
    subcategories: [{ value: "otros", label: "Otros", types: [{ value: "otro", label: "Otro" }] }],
  },
];

export function taxonomyCategory(value: string | null | undefined) {
  return PRODUCT_TAXONOMY.find((category) => category.value === value);
}

export function taxonomySubcategory(category: string | null | undefined, value: string | null | undefined) {
  return taxonomyCategory(category)?.subcategories.find((subcategory) => subcategory.value === value);
}

export function labelProductTaxonomy(value: string | null | undefined) {
  if (!value) return "—";
  for (const category of PRODUCT_TAXONOMY) {
    if (category.value === value) return category.label;
    for (const subcategory of category.subcategories) {
      if (subcategory.value === value) return subcategory.label;
      const type = subcategory.types.find((item) => item.value === value);
      if (type) return type.label;
    }
  }
  return value;
}

/** Validate the parent/child relationship when operators use known values. */
export function validateProductTaxonomy(categoryValue: string, subcategoryValue: string, typeValue: string) {
  return validateProductTaxonomyTree(PRODUCT_TAXONOMY, categoryValue, subcategoryValue, typeValue);
}

export function validateProductTaxonomyTree(taxonomy: ProductTaxonomyCategory[], categoryValue: string, subcategoryValue: string, typeValue: string) {
  const category = taxonomy.find((item) => item.value === categoryValue);
  if (!category) return null;
  const subcategory = category.subcategories.find((item) => item.value === subcategoryValue);
  if (!subcategory) return `La subcategoría ${subcategoryValue} no pertenece a la categoría ${categoryValue}.`;
  const knownType = PRODUCT_TAXONOMY.flatMap((item) => item.subcategories.flatMap((sub) => sub.types)).find((item) => item.value === typeValue);
  if (knownType && !subcategory.types.some((item) => item.value === typeValue)) {
    return `El tipo ${typeValue} no pertenece a la subcategoría ${subcategoryValue}.`;
  }
  return null;
}

export function taxonomyFromNodes(nodes: ProductTaxonomyNode[]): ProductTaxonomyCategory[] {
  const categories = nodes.filter((node) => node.kind === "category" && node.active).sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
  return categories.map((category) => ({
    value: category.value,
    label: category.label,
    subcategories: nodes
      .filter((node) => node.kind === "subcategory" && node.parentId === category.id && node.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      .map((subcategory) => ({
        value: subcategory.value,
        label: subcategory.label,
        types: nodes
          .filter((node) => node.kind === "type" && node.parentId === subcategory.id && node.active)
          .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
          .map((type) => ({ value: type.value, label: type.label })),
      })),
  }));
}

/** Merge editable values over the historical suggestions without losing old products. */
export function mergeProductTaxonomy(base: ProductTaxonomyCategory[], custom: ProductTaxonomyCategory[]) {
  const result = base.map((category) => {
    const override = custom.find((item) => item.value === category.value);
    if (!override) return category;
    return {
      ...category,
      label: override.label,
      subcategories: category.subcategories.map((subcategory) => {
        const customSubcategory = override.subcategories.find((item) => item.value === subcategory.value);
        return customSubcategory ? { ...subcategory, label: customSubcategory.label, types: customSubcategory.types.length > 0 ? customSubcategory.types : subcategory.types } : subcategory;
      }).concat(override.subcategories.filter((item) => !category.subcategories.some((candidate) => candidate.value === item.value))),
    };
  });
  return result.concat(custom.filter((category) => !base.some((item) => item.value === category.value)));
}
