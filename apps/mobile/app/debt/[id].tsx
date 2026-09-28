import { moneySchema } from '@justipe/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MovementRow } from '../../src/components/MovementRow';
import { Button, Card, confirmAction, Muted, SectionTitle } from '../../src/components/ui';
import { useCategories, useCategoryMap, useCreateMovement, useDebt, useDebtPayments, useDeleteDebt, useUpdateDebt } from '../../src/data/hooks';
import { formatDay, formatMoney, todayInLima } from '../../src/lib/format';
import { radius, spacing, useTheme } from '../../src/theme';

// Detalle de una deuda: saldo, pagos registrados y acciones
export default function DebtDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const debt = useDebt(id);
  const payments = useDebtPayments(id);
  const categories = useCategories();
  const categoryMap = useCategoryMap();
  const createMovement = useCreateMovement();
  const updateDebt = useUpdateDebt();
  const deleteDebt = useDeleteDebt();
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!debt) {
    return (
      <View style={[styles.content, { backgroundColor: theme.background, flex: 1 }]}>
        <Muted>Esta deuda ya no existe.</Muted>
      </View>
    );
  }

  const isMine = debt.direction === 'i_owe';
  const paymentType = isMine ? 'expense' : 'income';
  // Categoría por defecto para pagos/cobros: "Deudas" / "Cobro de deudas" o la primera del tipo
  const paymentCategory =
    (categories.data ?? []).find((c) => c.type === paymentType && /deuda/i.test(c.name)) ??
    (categories.data ?? []).find((c) => c.type === paymentType);
  const suggested = debt.installment && Number(debt.installment) < Number(debt.balance) ? debt.installment : debt.balance;

  async function registerPayment() {
    if (!debt) return;
    const parsed = moneySchema.safeParse((amount || suggested).replace(',', '.'));
    if (!parsed.success) return setError('Monto inválido');
    if (!paymentCategory) return setError(`Crea primero una categoría de ${isMine ? 'gasto' : 'ingreso'}`);
    setError(null);
    try {
      await createMovement.mutateAsync({
        type: paymentType,
        categoryId: paymentCategory.id,
        amountOriginal: parsed.data,
        currency: debt.currency,
        occurredOn: todayInLima(),
        note: `${isMine ? 'Pago' : 'Cobro'}: ${debt.counterparty}`,
        debtId: debt.id,
      });
      setAmount('');
      // Si con este pago queda en cero, se marca como cancelada
      if (Number(debt.balance) - Number(parsed.data) <= 0) {
        await updateDebt.mutateAsync({ id: debt.id, changes: { closedOn: todayInLima() } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar');
    }
  }

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card style={{ gap: spacing.xs }}>
        <Muted>{isMine ? 'Le debes a' : 'Te debe'}</Muted>
        <Text style={[styles.counterparty, { color: theme.text }]}>{debt.counterparty}</Text>
        {debt.description ? <Muted>{debt.description}</Muted> : null}
        <Text style={[styles.balance, { color: isMine ? theme.expense : theme.income }]}>{formatMoney(debt.balance, debt.currency)}</Text>
        <Muted>
          Pagado {formatMoney(debt.paidAmount, debt.currency)} de {formatMoney(debt.initialAmount, debt.currency)}
          {debt.installment ? ` · cuota ${formatMoney(debt.installment, debt.currency)}` : ''}
          {debt.expectedOn ? ` · pago estimado ${formatDay(debt.expectedOn)}` : ''}
        </Muted>
        {debt.closedOn ? <Muted>Cancelada el {formatDay(debt.closedOn)}</Muted> : null}
      </Card>

      {!debt.closedOn ? (
        <Card style={{ gap: spacing.md }}>
          <Text style={[styles.cardTitle, { color: theme.text }]}>{isMine ? 'Registrar pago' : 'Registrar cobro'}</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder={`${formatMoney(suggested, debt.currency)} (sugerido)`}
            placeholderTextColor={theme.textMuted}
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
          <Muted>
            Se registra como {isMine ? 'gasto' : 'ingreso'} de hoy en «{paymentCategory?.name ?? '—'}» y baja el saldo.
          </Muted>
          {error ? <Text style={{ color: theme.danger }}>{error}</Text> : null}
          <Button label={isMine ? 'Registrar pago' : 'Registrar cobro'} onPress={() => void registerPayment()} />
        </Card>
      ) : null}

      <SectionTitle>{isMine ? 'Pagos' : 'Cobros'}</SectionTitle>
      <Card style={{ paddingVertical: spacing.xs }}>
        {(payments.data ?? []).map((movement) => (
          <View key={movement.id}>
            <Muted style={{ marginTop: spacing.sm }}>{formatDay(movement.occurredOn)}</Muted>
            <MovementRow movement={movement} category={categoryMap.get(movement.categoryId)} />
          </View>
        ))}
        {payments.data?.length === 0 ? <Muted style={{ paddingVertical: spacing.md }}>Todavía no hay registros.</Muted> : null}
      </Card>

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <Button
          label={debt.closedOn ? 'Reabrir' : 'Marcar como cancelada'}
          variant="secondary"
          onPress={() => void updateDebt.mutateAsync({ id: debt.id, changes: { closedOn: debt.closedOn ? null : todayInLima() } })}
        />
        <Button
          label="Eliminar"
          variant="danger"
          onPress={() =>
            confirmAction('Eliminar deuda', `${debt.counterparty}: ${formatMoney(debt.initialAmount, debt.currency)}. Los pagos registrados se conservan.`, 'Eliminar', () => {
              void deleteDebt.mutateAsync(debt.id).then(() => router.back());
            })
          }
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 48,
  },
  counterparty: {
    fontSize: 22,
    fontWeight: '800',
  },
  balance: {
    fontSize: 32,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    marginTop: spacing.sm,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
  },
});
