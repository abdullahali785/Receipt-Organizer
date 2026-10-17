import { fetch } from 'expo/fetch';
import type { File } from 'expo-file-system';
import type { z } from 'zod';

import { DEFAULT_TIMEOUT_MS, EXTRACT_TIMEOUT_MS } from '@/constants/config';

import {
  CategoriesResponseSchema,
  ErrorResponseSchema,
  ExtractResponseSchema,
  HealthResponseSchema,
} from './schemas';

export type ApiConfig = { apiUrl: string; apiToken: string };

/** Every failure surfaces as an ApiError with a code the UI can branch on:
 * the backend's own codes (unauthorized, extraction_failed, ...) plus the
 * client-side `network`, `timeout`, `http_error`, and `bad_response`. */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = { method?: 'GET' | 'POST'; body?: FormData; timeoutMs?: number };

async function request<S extends z.ZodType>(
  config: ApiConfig,
  path: string,
  schema: S,
  { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
): Promise<z.infer<S>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(config.apiUrl.trim().replace(/\/+$/, '') + path, {
      method,
      body,
      headers: { Authorization: `Bearer ${config.apiToken.trim()}`, Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError('timeout', 'The server took too long to respond. Try again.');
    }
    throw new ApiError(
      'network',
      "Couldn't reach the server. Check your connection and the server URL in Settings.",
    );
  } finally {
    clearTimeout(timer);
  }

  const json: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const parsed = ErrorResponseSchema.safeParse(json);
    if (parsed.success) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, res.status);
    }
    throw new ApiError('http_error', `Server returned ${res.status}.`, res.status);
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('bad_response', 'Unexpected response from the server.', res.status);
  }
  return parsed.data;
}

export const api = {
  health: (config: ApiConfig) => request(config, '/v1/health', HealthResponseSchema),

  categories: (config: ApiConfig) => request(config, '/v1/categories', CategoriesResponseSchema),

  async extract(config: ApiConfig, file: File) {
    const form = new FormData();
    form.append('receipt', file);
    const res = await request(config, '/v1/extract', ExtractResponseSchema, {
      method: 'POST',
      body: form,
      timeoutMs: EXTRACT_TIMEOUT_MS,
    });
    return res.receipt;
  },
};
