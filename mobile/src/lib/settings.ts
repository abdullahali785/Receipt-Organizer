import * as SecureStore from 'expo-secure-store';

import type { ApiConfig } from '@/api/client';
import { DEFAULT_API_URL } from '@/constants/config';

// The token lives in the device keychain/keystore, never in the app bundle.
const URL_KEY = 'api_url';
const TOKEN_KEY = 'api_token';

export async function loadSettings(): Promise<ApiConfig> {
  const [apiUrl, apiToken] = await Promise.all([
    SecureStore.getItemAsync(URL_KEY),
    SecureStore.getItemAsync(TOKEN_KEY),
  ]);
  return { apiUrl: apiUrl || DEFAULT_API_URL, apiToken: apiToken ?? '' };
}

export async function saveSettings({ apiUrl, apiToken }: ApiConfig): Promise<ApiConfig> {
  const next = { apiUrl: apiUrl.trim(), apiToken: apiToken.trim() };
  await Promise.all([
    SecureStore.setItemAsync(URL_KEY, next.apiUrl),
    SecureStore.setItemAsync(TOKEN_KEY, next.apiToken),
  ]);
  return next;
}

export function isConfigured(config: ApiConfig | undefined): config is ApiConfig {
  return !!config && config.apiUrl.trim() !== '' && config.apiToken.trim() !== '';
}
