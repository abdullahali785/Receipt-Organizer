import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Banner, Button, Chip, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { deleteReceipt, getReceipt, saveReceipt, type Receipt } from '@/db/receipts';
import { useCategories } from '@/hooks/use-api';
import { useTheme } from '@/hooks/use-theme';
import {
  editorText,
  formFromReceipt,
  missingFields,
  todayIso,
  validateReview,
  type FieldErrors,
  type ReviewField,
  type ReviewForm,
} from '@/lib/review';

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'PKR'];

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  // Not cached after the screen closes: the form is seeded once, so a stale
  // copy would show old values when the same receipt is opened again.
  const receipt = useQuery({
    queryKey: ['receipt', id],
    queryFn: () => getReceipt(db, id),
    gcTime: 0,
  });

  if (receipt.isPending) {
    return (
      <ThemedView style={[styles.flex, styles.centered]}>
        <ActivityIndicator />
      </ThemedView>
    );
  }
  if (!receipt.data) {
    return (
      <ThemedView style={[styles.flex, styles.centered]}>
        <ThemedText>This receipt is no longer available.</ThemedText>
      </ThemedView>
    );
  }
  return <ReviewEditor receipt={receipt.data} />;
}

function ReviewEditor({ receipt }: { receipt: Receipt }) {
  const db = useSQLiteContext();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const categories = useCategories();
  const categoryOptions = categories.data?.categories ?? [receipt.category];
  const text = editorText(receipt.status);

  const [form, setForm] = useState<ReviewForm>(() => formFromReceipt(receipt));
  const [errors, setErrors] = useState<FieldErrors>({});
  const missing = useMemo(() => missingFields(form), [form]);

  const update = (field: ReviewField) => (value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const save = useMutation({
    mutationFn: async () => {
      const result = validateReview(form, categories.data?.categories ?? []);
      if (!result.ok) {
        setErrors(result.errors);
        return false;
      }
      await saveReceipt(db, receipt.id, result.value, receipt.category);
      return true;
    },
    onSuccess: async (saved) => {
      if (!saved) return;
      await queryClient.invalidateQueries({ queryKey: ['receipts'] });
      router.back();
    },
  });

  function remove() {
    Alert.alert(text.confirmTitle, text.confirmMessage, [
      { text: text.keep, style: 'cancel' },
      {
        text: text.remove,
        style: 'destructive',
        onPress: async () => {
          await deleteReceipt(db, receipt.id);
          await queryClient.invalidateQueries({ queryKey: ['receipts'] });
          router.back();
        },
      },
    ]);
  }

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: text.title }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {receipt.imageUri ? (
            <Image
              source={{ uri: receipt.imageUri }}
              style={[styles.image, { backgroundColor: theme.backgroundElement }]}
              contentFit="contain"
            />
          ) : null}

          {receipt.needsReview ? (
            <Banner tone="warning">
              {receipt.reviewReason ?? 'Some details were unclear. Check the highlighted fields.'}
            </Banner>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            Extraction confidence: {receipt.confidence}
          </ThemedText>

          <Field
            label="Vendor"
            value={form.vendor}
            onChangeText={update('vendor')}
            highlight={missing.has('vendor')}
            error={errors.vendor}
          />
          <Field
            label="Date"
            value={form.date}
            onChangeText={update('date')}
            highlight={missing.has('date')}
            error={errors.date}
            placeholder="YYYY-MM-DD"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
          />
          {missing.has('date') ? (
            <View style={styles.chips}>
              <Chip label="Use today" selected={false} onPress={() => update('date')(todayIso())} />
            </View>
          ) : null}
          <Field
            label="Total"
            value={form.total}
            onChangeText={update('total')}
            highlight={missing.has('total')}
            error={errors.total}
            keyboardType="decimal-pad"
          />
          <Field
            label="Currency"
            value={form.currency}
            onChangeText={(v) => update('currency')(v.toUpperCase())}
            highlight={missing.has('currency')}
            error={errors.currency}
            autoCapitalize="characters"
            maxLength={3}
            placeholder="USD"
          />
          <View style={styles.chips}>
            {COMMON_CURRENCIES.map((code) => (
              <Chip
                key={code}
                label={code}
                selected={form.currency === code}
                onPress={() => update('currency')(code)}
              />
            ))}
          </View>

          <ThemedText type="smallBold" themeColor="textSecondary">
            Category
          </ThemedText>
          <View style={styles.chips}>
            {categoryOptions.map((name) => (
              <Chip
                key={name}
                label={name}
                selected={form.category === name}
                onPress={() => update('category')(name)}
              />
            ))}
          </View>
          {errors.category ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {errors.category}
            </ThemedText>
          ) : null}

          {receipt.lineItems.length > 0 ? (
            <View style={styles.items}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Line items
              </ThemedText>
              {receipt.lineItems.map((item, i) => (
                <View key={i} style={styles.itemRow}>
                  <ThemedText type="small" style={styles.flex}>
                    {item.description}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {item.amount === null ? '' : item.amount.toFixed(2)}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button title={text.save} onPress={() => save.mutate()} loading={save.isPending} />
            <Button title={text.remove} variant="danger" onPress={remove} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  container: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  image: { width: '100%', height: 240, borderRadius: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  items: { gap: Spacing.one, marginTop: Spacing.two },
  itemRow: { flexDirection: 'row', gap: Spacing.three },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
});
