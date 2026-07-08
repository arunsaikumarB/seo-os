import { AGENT_OUTPUT_SCHEMAS } from '@seo-os/agent-contracts';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Minimal JSON Schema validation for Sprint 2 structured outputs */
export function validateAgentOutput(schemaId: string, output: unknown): ValidationResult {
  const schema = AGENT_OUTPUT_SCHEMAS[schemaId];
  if (!schema) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];
  const s = schema as { required?: string[]; properties?: Record<string, { type?: string }> };

  if (typeof output !== 'object' || output === null) {
    return { valid: false, errors: ['Output must be an object'] };
  }

  const obj = output as Record<string, unknown>;
  for (const field of s.required ?? []) {
    if (obj[field] === undefined || obj[field] === null) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  for (const [key, prop] of Object.entries(s.properties ?? {})) {
    if (obj[key] === undefined) continue;
    const expected = prop.type;
    if (expected === 'string' && typeof obj[key] !== 'string') {
      errors.push(`${key} must be a string`);
    }
    if (expected === 'boolean' && typeof obj[key] !== 'boolean') {
      errors.push(`${key} must be a boolean`);
    }
    if (expected === 'array' && !Array.isArray(obj[key])) {
      errors.push(`${key} must be an array`);
    }
  }

  return { valid: errors.length === 0, errors };
}
