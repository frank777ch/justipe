import type { DebtDirection } from '@justipe/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Chip, Muted } from '../../src/components/ui';
import { useDebts, type DebtWithBalance } from '../../src/data/hooks';
import { formatDay, formatMoney, todayInLima } from '../../src/lib/format';
import { useSyncNow } from '../../src/offline/SyncProvider';
import { radius, spacing, useTheme, type Theme } from '../../src/theme';

// Deudas en las dos direcciones: lo que debo y lo que me deben
export default function DebtsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [direction, setDirection] = useState<DebtDirection>('i_owe');
  const [showClosed, setShowClosed] = useState(false);
  const debts = useDebts();
  const { refreshing, onRefresh } = useSyncNow();

  const ofDirection = (debts.data ?? []).filter((debt) => debt.direction === direction);
  const open = ofDirection.filter((debt) => !debt.closedOn);
  const closed = ofDirection.filter((debt) => debt.closedOn);
  const totalOpen = open.reduce((sum, debt) => sum + Math.max(0, Number(debt.balance)), 0);
  const monthlyInstallments = open.reduce((sum, debt) => sum + Number(debt.installment ?? 0), 0);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
    >
      <Text style={[styles.title, { color: theme.text }]}>Deudas</Text>

      <View style={styles.row}>
        <Chip label="Lo que debo" selected={direction === 'i_owe'} onPress={() => setDirection('i_owe')} style={styles.flex} />
        <Chip label="Me deben" selected={direction === 'owed_to_me'} onPress={() => setDirection('owed_to_me')} style={styles.flex} />
      </View>

      <Card style={{ gap: spacing.xs }}>
        <Muted>{direction === 'i_owe' ? 'Total que debes' : 'Total que te deben'}</Muted>
        <Text style={[styles.total, { color: direction === 'i_owe' ? theme.expense : theme.income }]}>{formatMoney(totalOpen)}</Text>
        {direction === 'i_owe' && monthlyInstallments > 0 ? <Muted>Cuotas mensuales: {formatMoney(monthlyInstallments)}</Muted> : null}
        {ofDirection.some((debt) => debt.currency === 'USD') ? <Muted>Los totales suman montos en soles y dólares tal cual.</Muted> : null}
      </Card>

      {open.map((debt) => (
        <DebtCard key={debt.id} debt={debt} theme={theme} onPress={() => router.push({ pathname: '/debt/[id]', params: { id: debt.id } })} />
      ))}
      {open.length === 0 ? <Muted>{direction === 'i_owe' ? 'No tienes deudas pendientes.' : 'Nadie te debe nada.'}</Muted> : null}

      <Button
        label={direction === 'i_owe' ? 'Agregar deuda' : 'Agregar préstamo a cobrar'}
        onPress={() => router.push({ pathname: '/debt/new', params: { direction } })}
      />

      {closed.length > 0 ? (
        <Pressable onPress={() => setShowClosed((v) => !v)} hitSlop={8}>
          <Text style={{ color: theme.primary, fontWeight: '600' }}>
            {showClosed ? 'Ocultar' : 'Ver'} canceladas ({closed.length})
          </Text>
        </Pressable>
      ) : null}
      {showClosed
        ? closed.map((debt) => (
            <DebtCard key={debt.id} debt={debt} theme={theme} onPress={() => router.push({ pathname: '/debt/[id]', params: { id: debt.id } })} />
          ))
        : null}
    </ScrollView>
  );
}

function DebtCard({ debt, theme, onPress }: { debt: DebtWithBalance; theme: Theme; onPress: () => void }) {
  const initial = Number(debt.initialAmount);
  const progress = initial > 0 ? Math.min(1, Math.max(0, Number(debt.paidAmount) / initial)) : 0;
  const overdue = !debt.closedOn && debt.expectedOn !== null && debt.expectedOn < todayInLima();

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card style={{ gap: spacing.sm, opacity: debt.closedOn ? 0.6 : 1 }}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.counterparty, { color: theme.text }]} numberOfLines={1}>
              {debt.counterparty}
            </Text>
            {debt.description ? <Muted>{debt.description}</Muted> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.balance, { color: theme.text }]}>{formatMoney(debt.balance, debt.currency)}</Text>
            <Muted>de {formatMoney(debt.initialAmount, debt.currency)}</Muted>
          </View>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.surfaceMuted }]}>
          <View style={[styles.progressBar, { width: `${progress * 100}%`, backgroundColor: theme.primary }]} />
        </View>
        <View style={styles.cardHeader}>
          {debt.installment ? <Muted>Cuota {formatMoney(debt.installment, debt.currency)}</Muted> : <View />}
          {debt.closedOn ? (
            <Muted>Cancelada</Muted>
          ) : debt.expectedOn ? (
            <Text style={{ color: overdue ? theme.danger : theme.textMuted, fontSize: 13 }}>
              {overdue ? 'Venció' : 'Pago estimado'}: {formatDay(debt.expectedOn)}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
    justifyContent: 'center',
  },
  total: {
    fontSize: 28,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  counterparty: {
    fontSize: 16,
    fontWeight: '700',
  },
  balance: {
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressBar: {
    height: 6,
    borderRadius: radius.pill,
  },
});
