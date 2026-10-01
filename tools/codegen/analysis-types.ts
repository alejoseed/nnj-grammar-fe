// Generates src/types.ts (Zod schemas + inferred types) from the backend's
// JSON Schema, which nnj-grammar derives from its Rust structs:
//
//   npm run gen:types
//

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const SCHEMA_PATH = fileURLToPath(
  new URL(
    "../../../nnj-grammar/schema/analysis-document.schema.json",
    import.meta.url,
  ),
);
export const OUTPUT_PATH = fileURLToPath(
  new URL("../../src/types.ts", import.meta.url),
);

interface JsonSchema {
  $ref?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  format?: string;
  const?: string | number;
  enum?: string[];
  minimum?: number;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  $defs?: Record<string, JsonSchema>;
}

const JsonSchema: z.ZodType<JsonSchema> = z.lazy(() =>
  z.object({
    $ref: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    type: z.union([z.string(), z.array(z.string())]).optional(),
    format: z.string().optional(),
    const: z.union([z.string(), z.number()]).optional(),
    enum: z.array(z.string()).optional(),
    minimum: z.number().optional(),
    items: JsonSchema.optional(),
    properties: z.record(z.string(), JsonSchema).optional(),
    required: z.array(z.string()).optional(),
    oneOf: z.array(JsonSchema).optional(),
    anyOf: z.array(JsonSchema).optional(),
    $defs: z.record(z.string(), JsonSchema).optional(),
  }),
);

function refName(ref: string): string {
  const prefix = "#/$defs/";

  if (!ref.startsWith(prefix)) {
    throw new Error(`unsupported $ref: ${ref}`);
  }

  return ref.slice(prefix.length);
}

function docComment(text: string | undefined, indent: string): string {
  if (!text) {
    return "";
  }

  const lines = text.split("\n");

  if (lines.length === 1) {
    return `${indent}/** ${text} */\n`;
  }

  return `${indent}/**\n${lines.map((line) => `${indent} * ${line}`.trimEnd()).join("\n")}\n${indent} */\n`;
}

function enumExpression(values: string[], indent: string): string {
  const items = values.map((value) => `${indent}  ${JSON.stringify(value)},`);

  return `z.enum([\n${items.join("\n")}\n${indent}])`;
}

// Describes each variant of a documented enum, since z.enum cannot carry
// per-value docs.
function variantDocs(schema: JsonSchema): string | undefined {
  const documented = (schema.oneOf ?? []).flatMap((variant) =>
    variant.description
      ? [`- \`${variant.const}\`: ${variant.description.replaceAll("\n", "\n  ")}`]
      : [],
  );

  return documented.length > 0 ? documented.join("\n") : undefined;
}

function expression(schema: JsonSchema, indent: string): string {
  if (schema.$ref) {
    return refName(schema.$ref);
  }

  if (schema.anyOf) {
    const nullable = schema.anyOf.find((option) => option.type !== "null");

    if (schema.anyOf.length !== 2 || !nullable) {
      throw new Error(`unsupported anyOf: ${JSON.stringify(schema.anyOf)}`);
    }

    return `${expression(nullable, indent)}.nullable()`;
  }

  if (schema.oneOf) {
    return enumExpression(
      schema.oneOf.map((variant) => z.string().parse(variant.const)),
      indent,
    );
  }

  if (schema.enum) {
    return enumExpression(schema.enum, indent);
  }

  if (Array.isArray(schema.type)) {
    const types = schema.type.filter((type) => type !== "null");

    if (types.length !== 1 || types.length === schema.type.length) {
      throw new Error(`unsupported type union: ${schema.type.join(", ")}`);
    }

    return `${expression({ ...schema, type: types[0] }, indent)}.nullable()`;
  }

  switch (schema.type) {
    case "string":
      return schema.const === undefined
        ? "z.string()"
        : `z.literal(${JSON.stringify(schema.const)})`;
    case "boolean":
      return "z.boolean()";
    case "integer":
      if (schema.const !== undefined) {
        return `z.literal(${JSON.stringify(schema.const)})`;
      }

      return schema.minimum === 0 ? "index" : "z.int()";
    case "array":
      if (!schema.items) {
        throw new Error("array schema without items");
      }

      return `z.array(${expression(schema.items, indent)})`;
    case "object":
      return objectExpression(schema, indent);
    default:
      throw new Error(`unsupported schema: ${JSON.stringify(schema)}`);
  }
}

function objectExpression(schema: JsonSchema, indent: string): string {
  const required = new Set(schema.required ?? []);
  const fields = Object.entries(schema.properties ?? {}).map(([name, field]) => {
    let value = expression(field, `${indent}  `);
    const nullable = value.endsWith(".nullable()");

    // schemars leaves Option fields out of `required`, but the backend always
    // serializes them as null; only a non-nullable gap means truly optional.
    if (!required.has(name) && !nullable) {
      value += ".optional()";
    }

    return `${docComment(field.description, `${indent}  `)}${indent}  ${name}: ${value},`;
  });

  return `z.object({\n${fields.join("\n")}\n${indent}})`;
}

// Dependencies first, so every schema is declared before it is referenced.
function definitionOrder(root: JsonSchema): string[] {
  const defs = root.$defs ?? {};
  const order: string[] = [];
  const seen = new Set<string>();

  const visit = (schema: JsonSchema): void => {
    if (schema.$ref) {
      const name = refName(schema.$ref);
      const target = defs[name];

      if (seen.has(name)) {
        return;
      }

      if (!target) {
        throw new Error(`missing definition: ${name}`);
      }

      seen.add(name);
      visit(target);
      order.push(name);
      return;
    }

    for (const child of [
      schema.items,
      ...Object.values(schema.properties ?? {}),
      ...(schema.anyOf ?? []),
    ]) {
      if (child) {
        visit(child);
      }
    }
  };

  visit(root);
  return order;
}

function declaration(name: string, schema: JsonSchema): string {
  const docs = [schema.description, variantDocs(schema)]
    .filter((text) => text !== undefined)
    .join("\n\n");

  return [
    `${docComment(docs, "")}export const ${name} = ${expression(schema, "")};`,
    "",
    `export type ${name} = z.infer<typeof ${name}>;`,
  ].join("\n");
}

export function generateAnalysisTypes(source: string): string {
  const root = JsonSchema.parse(JSON.parse(source));
  const name = root.title;

  if (!name) {
    throw new Error("root schema has no title");
  }

  const defs = root.$defs ?? {};
  const declarations = definitionOrder(root).map((def) =>
    declaration(def, defs[def] ?? {}),
  );

  return [
    "// Generated by tools/codegen/analysis-types.ts from",
    "// nnj-grammar/schema/analysis-document.schema.json. Do not edit by hand;",
    "// change the Rust structs, then run `npm run gen:types`.",
    "",
    'import { z } from "zod";',
    "",
    "const index = z.int().nonnegative();",
    "",
    ...declarations.flatMap((text) => [text, ""]),
    declaration(name, root),
    "",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(
    OUTPUT_PATH,
    generateAnalysisTypes(readFileSync(SCHEMA_PATH, "utf8")),
  );
}
