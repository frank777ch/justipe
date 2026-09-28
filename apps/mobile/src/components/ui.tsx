import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { formatMonth } from '../lib/format';
import { radius, spacing, useTheme } from '../theme';

// Componentes visuales básicos compartidos por las pantallas

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }, style]}>{children}</View>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{children}</Text>
      {right}
    </View>
  );
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: ButtonProps) {
  const theme = useTheme();
  const background = variant === 'primary' ? theme.primary : variant === 'danger' ? theme.danger : theme.surfaceMuted;
  const color = variant === 'secondary' ? theme.text : theme.primaryText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={color} /> : <Text style={[styles.buttonLabel, { color }]}>{label}</Text>}
    </Pressable>
  );
}

interface ChipProps {
  label: string;
  onPress: () => void;
  selected?: boolean;
  large?: boolean;
  color?: string | null;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, onPress, selected, large, color, style }: ChipProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        large && styles.chipLarge,
        {
          backgroundColor: selected ? theme.primary : theme.surfaceMuted,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text
        numberOfLines={1}
        style={[styles.chipLabel, large && styles.chipLabelLarge, { color: selected ? theme.primaryText : theme.text }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function MonthSwitcher({ month, onChange, canGoForward = true }: { month: string; onChange: (delta: number) => void; canGoForward?: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.monthSwitcher}>
      <Pressable accessibilityLabel="Mes anterior" hitSlop={12} onPress={() => onChange(-1)}>
        <Ionicons name="chevron-back" size={22} color={theme.text} />
      </Pressable>
      <Text style={[styles.monthLabel, { color: theme.text }]}>{formatMonth(month)}</Text>
      <Pressable accessibilityLabel="Mes siguiente" hitSlop={12} onPress={() => onChange(1)} disabled={!canGoForward}>
        <Ionicons name="chevron-forward" size={22} color={canGoForward ? theme.text : theme.border} />
      </Pressable>
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return <Text style={[{ color: theme.textMuted, fontSize: 13 }, style]}>{children}</Text>;
}

export function LoadingView() {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.primary} size="large" />
    </View>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: spacing.md, alignItems: 'flex-start' }}>
      <Text style={{ color: theme.danger, fontWeight: '600' }}>{message}</Text>
      {onRetry ? <Button label="Reintentar" variant="secondary" onPress={onRetry} /> : null}
    </Card>
  );
}

// Confirmación que funciona en móvil (Alert) y en la vista previa web (window.confirm)
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void): void {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipLarge: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: radius.md,
    minWidth: 72,
    justifyContent: 'center',
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  chipLabelLarge: {
    fontSize: 18,
    fontWeight: '700',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  monthSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '700',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
