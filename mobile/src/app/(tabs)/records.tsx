import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecordsTable } from '@/components/records-table';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { listSavedReceipts } from '@/db/receipts';

export default function RecordsScreen() {
  const db = useSQLiteContext();
  const receipts = useQuery({ queryKey: ['receipts'], queryFn: () => listSavedReceipts(db) });

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
        <ThemedText type="subtitle" style={styles.title}>
          Records
        </ThemedText>
        {data.length > 0 ? (
          <RecordsTable receipts={data} />
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
  title: { paddingHorizontal: Spacing.four, paddingVertical: Spacing.three },
  empty: { paddingHorizontal: Spacing.four },
});
