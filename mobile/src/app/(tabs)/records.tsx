import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecordsTable } from '@/components/records-table';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Banner } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { listSavedReceipts } from '@/db/receipts';
import { useTheme } from '@/hooks/use-theme';
import { shareReceiptsCsv } from '@/lib/export';

export default function RecordsScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const receipts = useQuery({ queryKey: ['receipts'], queryFn: () => listSavedReceipts(db) });
  const exportCsv = useMutation({ mutationFn: shareReceiptsCsv });

  const { refetch } = receipts;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const data = receipts.data ?? [];

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="subtitle">Records</ThemedText>
          {data.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export as CSV"
              onPress={() => exportCsv.mutate(data)}
              disabled={exportCsv.isPending}
              hitSlop={8}
              style={({ pressed }) => [
                styles.export,
                { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
              ]}>
              {exportCsv.isPending ? (
                <ActivityIndicator color={theme.tint} />
              ) : (
                <ThemedText type="smallBold" style={{ color: theme.tint }}>
                  Export CSV
                </ThemedText>
              )}
            </Pressable>
          ) : null}
        </View>
        {exportCsv.isError ? (
          <View style={styles.banner}>
            <Banner tone="error">{`Export failed: ${exportCsv.error.message}`}</Banner>
          </View>
        ) : null}
        {data.length > 0 ? (
          <RecordsTable
            receipts={data}
            onPressRow={(id) => router.push({ pathname: '/review', params: { id } })}
          />
        ) : receipts.isPending ? null : (
          <ThemedText themeColor="textSecondary" style={styles.empty}>
            No receipts yet. Scan one from the Capture tab.
          </ThemedText>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  export: {
    minWidth: 104,
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.three },
  empty: { paddingHorizontal: Spacing.four },
});
