/** Small shared building blocks for the app's screens. */
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ title, onPress, variant = 'primary', disabled, loading }: ButtonProps) {
  const theme = useTheme();
  const background =
    variant === 'primary' ? theme.tint : variant === 'danger' ? 'transparent' : theme.backgroundElement;
  const color = variant === 'primary' ? theme.onTint : variant === 'danger' ? theme.danger : theme.text;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <ThemedText style={{ color, fontWeight: 600 }}>{title}</ThemedText>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  highlight?: boolean;
  error?: string;
};

/** Labeled text input. `highlight` marks a value the user should check. */
export function Field({ label, highlight, error, style, ...inputProps }: FieldProps) {
  const theme = useTheme();
  const borderColor = error ? theme.danger : highlight ? theme.warningText : theme.backgroundSelected;

  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {label}
        </ThemedText>
        {highlight && !error ? (
          <ThemedText type="small" style={{ color: theme.warningText }}>
            Check this
          </ThemedText>
        ) : null}
      </View>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            color: theme.text,
            borderColor,
            backgroundColor: highlight ? theme.warningBackground : theme.backgroundElement,
          },
          style,
        ]}
        {...inputProps}
      />
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? theme.tint : theme.backgroundElement },
      ]}>
      <ThemedText type="small" style={{ color: selected ? theme.onTint : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function Banner({ tone, children }: { tone: 'warning' | 'error'; children: string }) {
  const theme = useTheme();
  const isWarning = tone === 'warning';
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: isWarning ? theme.warningBackground : theme.backgroundElement },
      ]}>
      <ThemedText type="small" style={{ color: isWarning ? theme.warningText : theme.danger }}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { gap: Spacing.one },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 999,
  },
  banner: { borderRadius: 12, padding: Spacing.three },
});
