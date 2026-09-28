import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Category, Movement } from '../api/types';
import { formatMoney } from '../lib/format';
import { radius, spacing, useTheme } from '../theme';

// Fila de un movimiento: categoría, nota, monto con signo y etiqueta "Fijo" si vino de un recurrente
export function MovementRow({
  movement,
  category,
  onLongPress,
}: {
  movement: Movement;
  category: Category | undefined;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
  const isIncome = movement.type === 'income';
  const sign = isIncome ? '+' : '−';
  const showPen = movement.currency !== 'PEN';

  return (
    <Pressable
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, { opacity: pressed && onLongPress ? 0.7 : 1 }]}
    >
      <View style={[styles.dot, { backgroundColor: category?.color ?? theme.border }]} />
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {category?.name ?? 'Sin categoría'}
          </Text>
          {movement._pending ? (
            <Ionicons name="cloud-upload-outline" size={14} color={theme.textMuted} accessibilityLabel="Pendiente de sincronizar" />
          ) : null}
          {movement.recurringId ? (
            <Text style={[styles.badge, { color: theme.textMuted, backgroundColor: theme.surfaceMuted }]}>Fijo</Text>
          ) : null}
        </View>
        {movement.note ? (
          <Text style={{ color: theme.textMuted, fontSize: 13 }} numberOfLines={1}>
            {movement.note}
          </Text>
        ) : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.amount, { color: isIncome ? theme.income : theme.text }]}>
          {sign} {formatMoney(movement.amountOriginal, movement.currency)}
        </Text>
        {showPen ? <Text style={{ color: theme.textMuted, fontSize: 12 }}>{formatMoney(movement.amountPen)}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  amount: {
    fontSize: 15,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
