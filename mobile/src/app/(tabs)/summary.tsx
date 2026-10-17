import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { listSavedReceipts } from '@/db/receipts';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';
import { formatMonth, monthKey, shiftMonth, summarize, type CurrencySummary } from '@/lib/summary';

export default function SummaryScreen() {
  const db = useSQLiteContext();
  const receipts = useQuery({ queryKey: ['receipts'], queryFn: () => listSavedReceipts(db) });
  const [month, setMonth] = useState(() => monthKey());

  const { refetch } = receipts;
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const summaries = useMemo(() => summarize(receipts.data ?? [], month), [receipts.data, month]);

  return (
    <ThemedView style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top']}>
        <ScrollView contentContainerStyle={styles.container}>
          <ThemedText type="subtitle">Summary</ThemedText>

          <View style={styles.monthPicker}>
            <Arrow label="Previous month" symbol="‹" onPress={() => setMonth((m) => shiftMonth(m, -1))} />
            <ThemedText type="smallBold" style={styles.monthLabel}>
              {formatMonth(month)}
            </ThemedText>
            <Arrow label="Next month" symbol="›" onPress={() => setMonth((m) => shiftMonth(m, 1))} />
          </View>

          {summaries.length === 0 && !receipts.isPending ? (
            <ThemedText themeColor="textSecondary">No receipts in {formatMonth(month)}.</ThemedText>
          ) : null}
          {summaries.map((s) => (
            <CurrencyCard key={s.currency ?? ''} summary={s} />
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Arrow({ label, symbol, onPress }: { label: string; symbol: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.arrow,
        { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="subtitle" style={styles.arrowText}>
        {symbol}
      </ThemedText>
    </Pressable>
  );
}

function CurrencyCard({ summary }: { summary: CurrencySummary }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
      <View>
        <ThemedText type="subtitle">{formatMoney(summary.total, summary.currency)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {summary.count} {summary.count === 1 ? 'receipt' : 'receipts'}
        </ThemedText>
      </View>
      {summary.categories.map((c) => (
        <View key={c.category} style={styles.category}>
          <View style={styles.categoryRow}>
            <ThemedText type="small" style={styles.flex} numberOfLines={1}>
              {c.category}
            </ThemedText>
            <ThemedText type="smallBold">{formatMoney(c.total, summary.currency)}</ThemedText>
          </View>
          <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
            <View style={[styles.bar, { width: `${c.share * 100}%`, backgroundColor: theme.tint }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: Spacing.four, gap: Spacing.three },
  monthPicker: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  monthLabel: { flex: 1, textAlign: 'center', fontSize: 18 },
  arrow: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: { lineHeight: 36 },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.three },
  category: { gap: Spacing.one },
  categoryRow: { flexDirection: 'row', gap: Spacing.two },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
});
