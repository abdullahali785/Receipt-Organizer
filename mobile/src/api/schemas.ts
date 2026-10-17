/** Zod schemas mirroring the backend's JSON (backend/app.py, backend/agent.py). */
import { z } from 'zod';

export const LineItemSchema = z.object({
  description: z.string(),
  amount: z.number().nullable(),
});

export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);

export const ExtractedReceiptSchema = z.object({
  vendor: z.string().nullable(),
  date: z.string().nullable(),
  total_amount: z.number().nullable(),
  currency: z.string().nullable(),
  line_items: z.array(LineItemSchema),
  confidence: ConfidenceSchema,
  needs_review: z.boolean(),
  review_reason: z.string().nullable(),
  category: z.string(),
  category_source: z.enum(['rule', 'claude', 'default']),
});

export const ExtractResponseSchema = z.object({ receipt: ExtractedReceiptSchema });

export const CategoriesResponseSchema = z.object({
  categories: z.array(z.string()).min(1),
  default: z.string(),
});

export const HealthResponseSchema = z.object({ status: z.literal('ok') });

export const ErrorResponseSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type LineItem = z.infer<typeof LineItemSchema>;
export type Confidence = z.infer<typeof ConfidenceSchema>;
export type ExtractedReceipt = z.infer<typeof ExtractedReceiptSchema>;
export type CategoriesResponse = z.infer<typeof CategoriesResponseSchema>;
