import { useMutation } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Banner, Button } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { insertDraft } from '@/db/receipts';
import { useSettings } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import { deleteImage, prepareReceiptImage } from '@/lib/image';
import { isConfigured } from '@/lib/settings';

export default function CaptureScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const settings = useSettings();
  const configured = isConfigured(settings.data);

  const extract = useMutation({
    mutationFn: async (asset: ImagePicker.ImagePickerAsset) => {
      const id = Crypto.randomUUID();
      const file = await prepareReceiptImage(asset, id);
      try {
        const receipt = await api.extract(settings.data!, file);
        await insertDraft(db, id, receipt, file.uri);
        return id;
      } catch (error) {
        deleteImage(file.uri);
        throw error;
      }
    },
    onSuccess: (id) => router.push({ pathname: '/review', params: { id } }),
  });

  async function pick(source: 'camera' | 'library') {
    extract.reset();
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera access needed', 'Allow camera access in your phone settings.');
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (!result.canceled) extract.mutate(result.assets[0]);
  }

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Receipt Organizer</ThemedText>
          <ThemedText themeColor="textSecondary">
            Snap a receipt. Claude reads the vendor, date, total, and items, and suggests a
            category.
          </ThemedText>
        </View>

        {!settings.isPending && !configured ? (
          <Banner tone="warning">Add your server token in Settings before scanning.</Banner>
        ) : null}

        {extract.isPending ? (
          <View style={styles.status}>
            <ActivityIndicator size="large" color={theme.tint} />
            <ThemedText>Reading receipt…</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              If the server was asleep, the first scan can take up to a minute.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.actions}>
            <Button title="Take photo" onPress={() => pick('camera')} disabled={!configured} />
            <Button
              title="Choose from library"
              variant="secondary"
              onPress={() => pick('library')}
              disabled={!configured}
            />
          </View>
        )}

        {extract.isError ? <Banner tone="error">{extract.error.message}</Banner> : null}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, padding: Spacing.four, gap: Spacing.four },
  header: { gap: Spacing.two, marginTop: Spacing.four },
  actions: { gap: Spacing.three },
  status: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  center: { textAlign: 'center' },
});
