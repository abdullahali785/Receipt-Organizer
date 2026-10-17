import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api, type ApiConfig } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Banner, Button, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useSaveSettings, useSettings } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';

export default function SettingsScreen() {
  const settings = useSettings();
  if (!settings.data) return <ThemedView style={styles.flex} />;
  return <SettingsForm initial={settings.data} />;
}

function SettingsForm({ initial }: { initial: ApiConfig }) {
  const theme = useTheme();
  const [apiUrl, setApiUrl] = useState(initial.apiUrl);
  const [apiToken, setApiToken] = useState(initial.apiToken);
  const save = useSaveSettings();

  // Save first, then hit an authenticated endpoint so a bad token shows up here.
  const test = useMutation({
    mutationFn: async () => {
      const config = await save.mutateAsync({ apiUrl, apiToken });
      await api.categories(config);
    },
  });

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <ThemedText type="subtitle">Settings</ThemedText>

            <Field
              label="Server URL"
              value={apiUrl}
              onChangeText={setApiUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://your-server.onrender.com"
            />
            <Field
              label="API token"
              value={apiToken}
              onChangeText={setApiToken}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              placeholder="The API_TOKEN set on the server"
            />
            <ThemedText type="small" themeColor="textSecondary">
              {"Stored in your phone's secure keychain. Only ever sent to your server."}
            </ThemedText>

            <View style={styles.actions}>
              <Button
                title="Save & test connection"
                onPress={() => test.mutate()}
                loading={test.isPending}
              />
            </View>

            {test.isSuccess ? (
              <ThemedText style={{ color: theme.success }}>{"✓ Connected. You're ready to scan."}</ThemedText>
            ) : null}
            {test.isError ? <Banner tone="error">{test.error.message}</Banner> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: Spacing.four, gap: Spacing.three },
  actions: { marginTop: Spacing.two },
});
