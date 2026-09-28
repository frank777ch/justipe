import { useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCategoryMap, useDeleteMovement, useMovements } from '../../src/api/hooks';
import type { Movement } from '../../src/api/types';
import { MovementRow } from '../../src/components/MovementRow';
import { confirmAction, ErrorView, MonthSwitcher, Muted } from '../../src/components/ui';
import { currentMonth, formatDay, formatMoney, shiftMonth } from '../../src/lib/format';
import { spacing, useTheme } from '../../src/theme';

// Movimientos del mes agrupados por día, con el total gastado de cada día.
// Mantén presionado un movimiento para borrarlo.
export default function MovementsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentMonth());
  const movements = useMovements(month);
  const categoryMap = useCategoryMap();
  const deleteMovement = useDeleteMovement();

  const sections = useMemo(() => groupByDay(movements.data ?? []), [movements.data]);

  function askDelete(movement: Movement) {
    const category = categoryMap.get(movement.categoryId)?.name ?? 'movimiento';
    confirmAction(
      'Borrar movimiento',
      `${category}: ${formatMoney(movement.amountOriginal, movement.currency)}`,
      'Borrar',
      () => deleteMovement.mutate(movement.id),
    );
  }

  return (
    <SectionList
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl refreshing={movements.isRefetching} onRefresh={() => void movements.refetch()} tintColor={theme.primary} />
      }
      ListHeaderComponent={
        <View style={{ gap: spacing.md, marginBottom: spacing.sm }}>
          <MonthSwitcher month={month} onChange={(delta) => setMonth((m) => shiftMonth(m, delta))} />
          {movements.error ? <ErrorView message={movements.error.message} onRetry={() => void movements.refetch()} /> : null}
          {movements.data?.length === 0 ? <Muted>Sin movimientos este mes.</Muted> : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={[styles.day, { color: theme.text }]}>{formatDay(section.date)}</Text>
          {section.spent > 0 ? (
            <Text style={{ color: theme.textMuted, fontVariant: ['tabular-nums'] }}>{formatMoney(section.spent)}</Text>
          ) : null}
        </View>
      )}
      renderItem={({ item }) => (
        <View style={[styles.item, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MovementRow movement={item} category={categoryMap.get(item.categoryId)} onLongPress={() => askDelete(item)} />
        </View>
      )}
    />
  );
}

interface DaySection {
  date: string;
  spent: number;
  data: Movement[];
}

// Agrupa por fecha (ya vienen ordenados de más reciente a más antiguo)
function groupByDay(movements: Movement[]): DaySection[] {
  const sections: DaySection[] = [];
  for (const movement of movements) {
    let section = sections[sections.length - 1];
    if (!section || section.date !== movement.occurredOn) {
      section = { date: movement.occurredOn, spent: 0, data: [] };
      sections.push(section);
    }
    section.data.push(movement);
    if (movement.type === 'expense') section.spent += Number(movement.amountPen);
  }
  return sections;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    paddingBottom: 48,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  day: {
    fontSize: 15,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  item: {
    paddingHorizontal: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    marginBottom: spacing.xs,
  },
});
