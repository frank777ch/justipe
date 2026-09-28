import { Link } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCategoryMap, useDashboard, useMovements } from '../../src/data/hooks';
import type { DashboardSummary } from '../../src/api/types';
import { MovementRow } from '../../src/components/MovementRow';
import { QuickAdd } from '../../src/components/QuickAdd';
import { SyncBanner } from '../../src/components/SyncBanner';
import { Card, MonthSwitcher, Muted, SectionTitle } from '../../src/components/ui';
import { useSyncNow } from '../../src/offline/SyncProvider';
import { currentMonth, formatMoney, shiftMonth } from '../../src/lib/format';
import { radius, spacing, useTheme, type Theme } from '../../src/theme';

// Dashboard: cuánto puedo gastar por día, resumen del mes y registro rápido
export default function DashboardScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [month, setMonth] = useState(currentMonth());
  const dashboard = useDashboard(month);
  const movements = useMovements(month);
  const categoryMap = useCategoryMap();
  const isCurrentMonth = month === currentMonth();

  const { refreshing, onRefresh } = useSyncNow();

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      <SyncBanner />
      <MonthSwitcher month={month} onChange={(delta) => setMonth((m) => shiftMonth(m, delta))} />

      <Hero summary={dashboard.data} theme={theme} />

      {isCurrentMonth ? <QuickAdd /> : null}

      <StatsGrid summary={dashboard.data} theme={theme} />

      <SectionTitle
        right={
          <Link href="/movements" style={{ color: theme.primary, fontWeight: '600' }}>
            Ver todos
          </Link>
        }
      >
        Últimos movimientos
      </SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        {(movements.data ?? []).slice(0, 5).map((movement) => (
          <MovementRow key={movement.id} movement={movement} category={categoryMap.get(movement.categoryId)} />
        ))}
        {movements.data?.length === 0 ? <Muted style={{ paddingVertical: spacing.md }}>Sin movimientos este mes.</Muted> : null}
      </Card>
    </ScrollView>
  );
}

function Hero({ summary, theme }: { summary: DashboardSummary | undefined; theme: Theme }) {
  const hasBudget = summary?.dailyBudget != null;
  return (
    <View style={[styles.hero, { backgroundColor: theme.hero }]}>
      <Text style={[styles.heroLabel, { color: theme.heroMuted }]}>
        {hasBudget ? 'Puedes gastar por día' : 'Te quedó este mes'}
      </Text>
      <Text style={[styles.heroAmount, { color: theme.heroText }]}>
        {summary ? formatMoney(hasBudget ? summary.dailyBudget! : summary.remaining) : '—'}
      </Text>
      {summary && hasBudget ? (
        <Text style={{ color: theme.heroMuted, fontSize: 14 }}>
          {summary.daysLeft} {summary.daysLeft === 1 ? 'día restante' : 'días restantes'} ·{' '}
          {formatMoney(summary.projectedRemaining)} disponibles
        </Text>
      ) : null}
    </View>
  );
}

function StatsGrid({ summary, theme }: { summary: DashboardSummary | undefined; theme: Theme }) {
  const value = (amount: string | undefined) => (amount === undefined ? '—' : formatMoney(amount));
  const pendingIncome = summary ? Number(summary.pendingIncome) : 0;
  const pendingFixed = summary ? Number(summary.pendingFixedExpenses) : 0;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.grid}>
        <Stat label="Ingresos" value={value(summary?.income)} color={theme.income} theme={theme} />
        <Stat
          label="Te queda"
          value={value(summary?.remaining)}
          color={summary && Number(summary.remaining) < 0 ? theme.danger : theme.text}
          theme={theme}
        />
        <Stat label="Gastos fijos" value={value(summary?.fixedExpenses)} color={theme.text} theme={theme} />
        <Stat label="Gastos variables" value={value(summary?.variableExpenses)} color={theme.expense} theme={theme} />
      </View>
      {summary && pendingFixed > 0 ? (
        <Muted>Fijos por venir: −{formatMoney(pendingFixed)} (ya descontados del presupuesto diario)</Muted>
      ) : null}
      {summary && pendingIncome > 0 ? (
        <Muted>Ingresos por venir: +{formatMoney(pendingIncome)} (no se cuentan hasta que lleguen)</Muted>
      ) : null}
    </View>
  );
}

function Stat({ label, value, color, theme }: { label: string; value: string; color: string; theme: Theme }) {
  return (
    <View style={[styles.stat, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={{ color: theme.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 48,
  },
  hero: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  heroLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  heroAmount: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  stat: {
    flexBasis: '48%',
    flexGrow: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
