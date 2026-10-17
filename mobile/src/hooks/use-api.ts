import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ApiConfig } from '@/api/client';
import { isConfigured, loadSettings, saveSettings } from '@/lib/settings';

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: loadSettings, staleTime: Infinity });
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: ApiConfig) => saveSettings(config),
    onSuccess: (config) => {
      queryClient.setQueryData(['settings'], config);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

/** Categories come from the server's categories.json so rules and the picker agree. */
export function useCategories() {
  const settings = useSettings();
  const config = settings.data;
  return useQuery({
    queryKey: ['categories', config?.apiUrl],
    queryFn: () => api.categories(config!),
    enabled: isConfigured(config),
    staleTime: 60 * 60 * 1000,
  });
}
