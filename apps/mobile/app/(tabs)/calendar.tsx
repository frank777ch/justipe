import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MovementRow } from '../../src/components/MovementRow';
import { Card, MonthSwitcher, Muted, SectionTitle } from '../../src/components/ui';
import { useCategoryMap, useDailyTotals, useMovements } from '../../src/data/hooks';
import { currentMonth, formatDay, formatMoney, monthRange, shiftMonth, todayInLima } from '../../src/lib/format';
import { useSyncNow } from '../../src/offline/SyncProvider';
import { radius, spacing, useTheme } from '../../src/theme';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

// Calendario mensual con el total gastado por día. Tocar un día muestra sus movimientos.
export default function CalendarScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<string | null>(todayInLima());
  const totals = useDailyTotals(month);
  const movements = useMovements(month);
  const categoryMap = useCategoryMap();
  const { refreshing, onRefresh } = useSyncNow();

  const today = todayInLima();
  const cells = useMemo(() => buildMonthCells(month), [month]);
  const dayTotals = totals.data ?? {};
  const maxExpense = Math.max(0, ...Object.values(dayTotals).map((d) => Number(d.expense)));
  const monthTotal = Object.values(dayTotals).reduce((sum, d) => sum + Number(d.expense), 0);
  const selectedMovements = (movements.data ?? []).filter((m) => m.occurredOn === selected);

  function changeMonth(delta: number) {
    const next = shiftMonth(month, delta);
    setMonth(next);
    setSelected(next === currentMonth() ? today : null);
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      <MonthSwitcher month={month} onChange={changeMonth} />
      <Muted>Gastado en el mes: {formatMoney(monthTotal)}</Muted>

      <Card style={{ padding: spacing.sm }}>
        <View style={styles.week}>
          {WEEKDAYS.map((day, index) => (
            <Text key={index} style={[styles.weekday, { color: theme.textMuted }]}>
              {day}
            </Text>
          ))}
        </View>
        {chunk(cells, 7).map((week, weekIndex) => (
          <View key={weekIndex} style={styles.week}>
            {week.map((date, index) => {
              if (!date) return <View key={index} style={styles.cell} />;
              const expense = Number(dayTotals[date]?.expense ?? 0);
              // Intensidad del fondo según lo gastado ese día respecto al día de más gasto
              const intensity = maxExpense > 0 ? expense / maxExpense : 0;
              const isSelected = date === selected;
              const isToday = date === today;
              return (
                <Pressable
                  key={date}
                  accessibilityRole="button"
                  accessibilityLabel={`${date}: ${formatMoney(expense)}`}
                  onPress={() => setSelected(date)}
                  style={[
                    styles.cell,
                    styles.day,
                    {
                      backgroundColor: expense > 0 ? withAlpha(theme.expense, 0.12 + intensity * 0.45) : 'transparent',
                      borderColor: isSelected ? theme.primary : isToday ? theme.border : 'transparent',
                    },
                  ]}
                >
                  <Text style={[styles.dayNumber, { color: theme.text, fontWeight: isToday ? '800' : '500' }]}>
                    {Number(date.slice(8))}
                  </Text>
                  <Text numberOfLines={1} style={[styles.dayAmount, { color: expense > 0 ? theme.text : 'transparent' }]}>
                    {compactAmount(expense)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </Card>

      {selected ? (
        <>
          <SectionTitle right={<Muted>{formatMoney(dayTotals[selected]?.expense ?? 0)}</Muted>}>{formatDay(selected)}</SectionTitle>
          <Card style={{ paddingVertical: spacing.xs }}>
            {selectedMovements.map((movement) => (
              <MovementRow key={movement.id} movement={movement} category={categoryMap.get(movement.categoryId)} />
            ))}
            {selectedMovements.length === 0 ? <Muted style={{ paddingVertical: spacing.md }}>Sin movimientos este día.</Muted> : null}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

// Celdas del mes empezando en lunes; null = hueco antes del día 1 o después del último
function buildMonthCells(month: string): (string | null)[] {
  const { from, to } = monthRange(month);
  const firstWeekday = (new Date(`${from}T00:00:00Z`).getUTCDay() + 6) % 7;
  const days = Number(to.slice(8));
  const cells: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= days; day++) cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

// 13 -> "13", 186.4 -> "186", 1300 -> "1.3k"
function compactAmount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return value >= 100 ? String(Math.round(value)) : String(Math.round(value * 10) / 10);
}

// "#C2410C" + 0.3 -> "rgba(194, 65, 12, 0.3)"
function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha.toFixed(2)})`;
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 48,
  },
  week: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: spacing.xs,
  },
  cell: {
    flex: 1,
    aspectRatio: 0.85,
    margin: 2,
  },
  day: {
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  dayNumber: {
    fontSize: 14,
  },
  dayAmount: {
    fontSize: 10,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
});
