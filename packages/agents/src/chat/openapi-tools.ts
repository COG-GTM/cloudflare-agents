/**
 * OpenAPI tool conversion for `@cloudflare/ai-utils` compatibility.
 *
 * `createToolsFromOpenAPISpec` (from `@cloudflare/ai-utils`) returns tools
 * with a raw JSON Schema `parameters` field. The AI SDK (`ai` package v5+)
 * expects tool input schemas to be wrapped with `jsonSchema()` or to be
 * Zod schemas.
 *
 * This module provides `toAISDKTools` which converts the output of
 * `createToolsFromOpenAPISpec` into AI SDK-compatible tool definitions.
 */

import type { JSONSchema7, ToolSet } from "ai";
import { tool, jsonSchema } from "ai";

/**
 * Shape of a single tool returned by `createToolsFromOpenAPISpec`
 * from `@cloudflare/ai-utils`.
 *
 * Each tool has a `name`, `description`, raw JSON Schema `parameters`,
 * and an optional `function` that executes the API call.
 */
export type OpenAPIToolSchema = {
  /** Tool name derived from the OpenAPI operation */
  name: string;
  /** Human-readable description of what the tool does */
  description: string;
  /** JSON Schema defining the tool's input parameters */
  parameters: JSONSchema7;
  /** Optional execute function that calls the API endpoint */
  function?: (args: Record<string, unknown>) => Promise<string>;
};

/**
 * Converts tools from `@cloudflare/ai-utils`'s `createToolsFromOpenAPISpec`
 * into AI SDK-compatible tool definitions.
 *
 * Wraps each tool's raw JSON Schema `parameters` with `jsonSchema()` from
 * the `ai` package so they work directly with `streamText`, `generateText`,
 * and other AI SDK functions.
 *
 * @example
 * ```ts
 * import { createToolsFromOpenAPISpec } from "@cloudflare/ai-utils";
 * import { toAISDKTools } from "agents/chat";
 * import { streamText } from "ai";
 *
 * const openAPITools = await createToolsFromOpenAPISpec(spec, config);
 * const tools = toAISDKTools(openAPITools);
 *
 * const result = streamText({
 *   model,
 *   messages,
 *   tools
 * });
 * ```
 *
 * @param openAPITools - Array of tools from `createToolsFromOpenAPISpec`
 * @returns Record of AI SDK tools keyed by tool name
 */
export function toAISDKTools(openAPITools?: OpenAPIToolSchema[]): ToolSet {
  if (!openAPITools || openAPITools.length === 0) {
    return {};
  }

  const seenNames = new Set<string>();
  for (const t of openAPITools) {
    if (seenNames.has(t.name)) {
      console.warn(
        `[toAISDKTools] Duplicate tool name "${t.name}" found. Later definitions will override earlier ones.`
      );
    }
    seenNames.add(t.name);
  }

  return Object.fromEntries(
    openAPITools.map((t) => [
      t.name,
      tool({
        description: t.description ?? "",
        inputSchema: jsonSchema(t.parameters ?? { type: "object" }),
        execute: t.function
          ? async (args) => {
              return await t.function!(args as Record<string, unknown>);
            }
          : undefined
      })
    ])
  );
}
