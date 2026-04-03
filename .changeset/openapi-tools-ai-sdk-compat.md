---
"agents": minor
"@cloudflare/ai-chat": minor
---

Add `toAISDKTools()` utility and `OpenAPIToolSchema` type for converting OpenAPI tools from `@cloudflare/ai-utils` into AI SDK-compatible tool definitions. Wraps raw JSON Schema `parameters` with `jsonSchema()` so tools from `createToolsFromOpenAPISpec` work directly with `streamText`, `generateText`, and other AI SDK v5+ functions.
