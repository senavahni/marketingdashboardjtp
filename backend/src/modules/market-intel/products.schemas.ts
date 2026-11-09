import { z } from 'zod';

const featureInput = z.strictObject({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(2_000).nullable().optional(),
  benefit: z.string().trim().max(1_000).nullable().optional(),
});

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .max(160)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug hanya huruf kecil, angka, dan tanda hubung');
const money = z.union([z.number(), z.string().regex(/^\d{1,16}(\.\d{1,2})?$/)]).transform(String);

const productFields = {
  name: z.string().trim().min(1).max(150),
  slug: slug.optional(),
  category: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(5_000).nullable().optional(),
  value_proposition: z.string().trim().max(2_000).nullable().optional(),
  target_notes: z.string().trim().max(2_000).nullable().optional(),
  price_range: z.string().trim().max(100).nullable().optional(),
  deal_value_estimate: money.nullable().optional(),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  /** Urutan array = order_index. */
  features: z.array(featureInput).max(50).default([]),
};

export const createProductSchema = z.strictObject(productFields);
export const updateProductSchema = z
  .strictObject({ ...productFields, status: productFields.status.removeDefault().optional(), features: productFields.features.removeDefault().optional() })
  .partial();
export const productsQuerySchema = z.strictObject({
  status: z.enum(['draft', 'active', 'archived']).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** Slug dari nama: huruf kecil ASCII + tanda hubung. */
export function slugify(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 150);
  return base || 'produk';
}
