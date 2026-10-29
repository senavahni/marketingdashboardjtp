import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';

function toSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}

/** Mendokumentasikan body request di Swagger dari schema Zod. */
export const ApiZodBody = (schema: z.ZodType) => ApiBody({ schema: toSchema(schema) as never });

/** Mendokumentasikan query params di Swagger dari schema Zod object. */
export function ApiZodQuery(schema: z.ZodObject) {
  const json = toSchema(schema) as { properties?: Record<string, unknown>; required?: string[] };
  const decorators = Object.entries(json.properties ?? {}).map(([name, prop]) =>
    ApiQuery({ name, required: json.required?.includes(name) ?? false, schema: prop as never }),
  );
  return applyDecorators(...decorators);
}
