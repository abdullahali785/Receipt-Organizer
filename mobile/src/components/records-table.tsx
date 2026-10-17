/** Read-only, spreadsheet-style table of saved receipts with sortable columns. */
import { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Receipt } from '@/db/receipts';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/lib/money';
import { DEFAULT_SORT, nextSort, sortReceipts, totalsByCurrency, type SortKey } from '@/lib/table';

const COLUMNS: { key: SortKey; label: string; width: number; align?: 'right' }[] = [
  { key: 'date', label: 'Date', width: 108 },
  { key: 'vendor', label: 'Vendor', width: 180 },
  { key: 'category', label: 'Category', width: 150 },
  { key: 'total', label: 'Total', width: 120, align: 'right' },
];
const FLAG_WIDTH = 64;
const TABLE_WIDTH = COLUMNS.reduce((sum, c) => sum + c.width, FLAG_WIDTH);
const width = (key: SortKey) => COLUMNS.find((c) => c.key === key)!.width;

export function RecordsTable({ receipts }: { receipts: Receipt[] }) {
  const theme = useTheme();
  const [sort, setSort] = useState(DEFAULT_SORT);
  const rows = useMemo(() => sortReceipts(receipts, sort), [receipts, sort]);
  const totals = useMemo(() => totalsByCurrency(receipts), [receipts]);
  const border = { borderColor: theme.backgroundSelected };

  return (
    <ScrollView horizontal contentContainerStyle={styles.scroll}>
      <View style={{ width: TABLE_WIDTH }}>
        {/* Outside the FlatList so it stays put while rows scroll. */}
        <View style={[styles.row, styles.header, border, { backgroundColor: theme.backgroundElement }]}>
          {COLUMNS.map((c) => {
            const active = sort.key === c.key;
            const arrow = active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
            return (
              <Pressable
                key={c.key}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${c.label}`}
                accessibilityState={{ selected: active }}
                onPress={() => setSort((s) => nextSort(s, c.key))}
                style={[styles.cell, { width: c.width }]}>
                <ThemedText
                  type="smallBold"
                  themeColor={active ? 'text' : 'textSecondary'}
                  style={c.align === 'right' && styles.right}>
                  {c.label + arrow}
                </ThemedText>
              </Pressable>
            );
          })}
          <View style={[styles.cell, { width: FLAG_WIDTH }]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Check
            </ThemedText>
          </View>
        </View>

        <FlatList
          style={styles.flex}
          data={rows}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <Row receipt={item} />}
        />

        <View style={[styles.row, styles.footer, border, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.cell, { width: width('date') + width('vendor') + width('category') }]}>
            <ThemedText type="smallBold">
              {receipts.length} {receipts.length === 1 ? 'receipt' : 'receipts'}
            </ThemedText>
          </View>
          <View style={[styles.cell, { width: width('total') }]}>
            {totals.map((t) => (
              <ThemedText key={t.currency ?? ''} type="smallBold" style={styles.right}>
                {formatMoney(t.total, t.currency)}
              </ThemedText>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function Row({ receipt }: { receipt: Receipt }) {
  const theme = useTheme();
  return (
    <View testID={`row-${receipt.id}`} style={[styles.row, { borderColor: theme.backgroundSelected }]}>
      <Cell width={width('date')}>{receipt.date ?? '—'}</Cell>
      <Cell width={width('vendor')}>{receipt.vendor ?? '—'}</Cell>
      <Cell width={width('category')}>{receipt.category}</Cell>
      <Cell width={width('total')} right>
        {formatMoney(receipt.totalAmount, receipt.currency)}
      </Cell>
      <View style={[styles.cell, { width: FLAG_WIDTH }]}>
        {receipt.needsReview ? (
          <ThemedText
            type="small"
            accessibilityLabel={receipt.reviewReason ?? 'Flagged for review'}
            style={{ color: theme.warningText }}>
            ⚠︎
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function Cell({ width, right, children }: { width: number; right?: boolean; children: string }) {
  return (
    <View style={[styles.cell, { width }]}>
      <ThemedText type="small" numberOfLines={1} style={right && styles.right}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  row: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
  header: { borderTopWidth: StyleSheet.hairlineWidth },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0 },
  cell: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, justifyContent: 'center' },
  right: { textAlign: 'right' },
});
