import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { listSavedReceipts, type Receipt } from '@/db/receipts';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';

export default function RecordsScreen() {
  const db = useSQLiteContext();
  const receipts = useQuery({ queryKey: ['receipts'], queryFn: () => listSavedReceipts(db) });

  const { refetch } = receipts;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ThemedText type="subtitle" style={styles.title}>
          Records
        </ThemedText>
        <FlatList
          data={receipts.data ?? []}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <ReceiptRow receipt={item} />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            receipts.isPending ? undefined : (
              <ThemedText themeColor="textSecondary">
                No receipts yet. Scan one from the Capture tab.
              </ThemedText>
            )
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function ReceiptRow({ receipt }: { receipt: Receipt }) {
  const theme = useTheme();
  return (
    <View style={[styles.row, { borderColor: theme.backgroundSelected }]}>
      <View style={styles.rowMain}>
        <ThemedText numberOfLines={1}>{receipt.vendor}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {receipt.date} · {receipt.category}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">{formatMoney(receipt.totalAmount, receipt.currency)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  title: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  list: { padding: Spacing.four, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowMain: { flex: 1, gap: Spacing.half },
});
