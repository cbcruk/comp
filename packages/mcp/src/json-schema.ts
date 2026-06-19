/** A deliberately small JSON Schema subset — enough for MCP tool inputs. */
export interface JsonSchema {
  type: "object" | "string" | "number" | "boolean" | "array";
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
}
