import { z } from "zod";
import type { ToolParameterSchema } from "@/lib/ai/provider";

/**
 * Minimal Zod → JSON-schema projection for tool parameters.
 *
 * The Zod schema stays the single source of truth for validation; this projects
 * the object shape the model needs. Only the constructs used by the agent tools
 * are handled (object/string/number/boolean/enum/literal/array + wrappers);
 * anything unknown degrades to an unconstrained value rather than throwing.
 *
 * Dispatch is by `_def.typeName` rather than `instanceof` on purpose: duplicate
 * copies of `zod` in a dependency tree (a real bundling hazard) would break
 * `instanceof`, and the type names are stable across Zod 3.x.
 */

type JsonSchema = Record<string, unknown>;
type AnySchema = z.ZodTypeAny;

function kindOf(schema: AnySchema): string {
  return (schema as { _def?: { typeName?: string } })._def?.typeName ?? "";
}

function unwrap(schema: AnySchema): { inner: AnySchema; optional: boolean; nullable: boolean } {
  let inner: AnySchema = schema;
  let optional = false;
  let nullable = false;
  for (;;) {
    switch (kindOf(inner)) {
      case "ZodOptional":
        optional = true;
        inner = (inner as z.ZodOptional<AnySchema>).unwrap();
        continue;
      case "ZodDefault":
        optional = true;
        inner = (inner as z.ZodDefault<AnySchema>).removeDefault();
        continue;
      case "ZodNullable":
        nullable = true;
        inner = (inner as z.ZodNullable<AnySchema>).unwrap();
        continue;
      // Transparent wrappers. A `.refine(...)`/`.transform(...)` (or `.catch`,
      // `.brand`, `.readonly`, `.pipe`) turns a `ZodObject` into a wrapper whose
      // `.shape` is undefined; without unwrapping, `objectSchema` would crash on
      // `Object.entries(undefined)`. Peeling to the wrapped schema keeps the
      // projection working for any decorated object schema.
      case "ZodEffects":
        inner = (inner as { _def: { schema: AnySchema } })._def.schema;
        continue;
      case "ZodCatch":
      case "ZodReadonly":
        inner = (inner as { _def: { innerType: AnySchema } })._def.innerType;
        continue;
      case "ZodBranded":
        inner = (inner as { _def: { type: AnySchema } })._def.type;
        continue;
      case "ZodPipeline":
        inner = (inner as { _def: { in: AnySchema } })._def.in;
        continue;
      default:
        return { inner, optional, nullable };
    }
  }
}

function toJsonSchema(schema: AnySchema): JsonSchema {
  const { inner, nullable } = unwrap(schema);
  let json: JsonSchema;
  switch (kindOf(inner)) {
    case "ZodString":
      json = { type: "string" };
      break;
    case "ZodNumber":
      json = { type: "number" };
      break;
    case "ZodBoolean":
      json = { type: "boolean" };
      break;
    case "ZodEnum":
      json = { type: "string", enum: [...(inner as z.ZodEnum<[string, ...string[]]>).options] };
      break;
    case "ZodLiteral":
      json = { enum: [(inner as z.ZodLiteral<unknown>).value] };
      break;
    case "ZodArray":
      json = { type: "array", items: toJsonSchema((inner as z.ZodArray<AnySchema>).element) };
      break;
    case "ZodObject":
      json = objectSchema(inner as z.ZodObject<z.ZodRawShape>);
      break;
    default:
      json = {};
      break;
  }
  if (nullable) json = { ...json, nullable: true };
  return json;
}

function objectSchema(schema: z.ZodObject<z.ZodRawShape>): JsonSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(schema.shape)) {
    const typed = value as AnySchema;
    const { optional } = unwrap(typed);
    properties[key] = toJsonSchema(typed);
    if (!optional) required.push(key);
  }
  return { type: "object", properties, required, additionalProperties: false };
}

export function zodToParameters(schema: z.ZodTypeAny): ToolParameterSchema {
  const { inner } = unwrap(schema);
  if (kindOf(inner) !== "ZodObject") {
    // Degrade rather than throw (same contract as `toJsonSchema`): a tool whose
    // root is not an object still projects to a valid, unconstrained spec.
    return { type: "object", properties: {}, additionalProperties: false };
  }
  return objectSchema(inner as z.ZodObject<z.ZodRawShape>) as ToolParameterSchema;
}
