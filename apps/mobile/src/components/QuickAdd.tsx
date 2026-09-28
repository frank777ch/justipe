import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiRequestError } from '../api/client';
import { useCategories, useCreateMovement, useDeleteMovement, useQuickAmounts } from '../api/hooks';
import type { Category, Movement, QuickAmount } from '../api/types';
import { currencySymbol, formatMoney, formatShortAmount, todayInLima } from '../lib/format';
import { radius, spacing, useTheme } from '../theme';
import { Card, Chip, Muted } from './ui';

// Registro rápido de gastos:
//   toque 1: monto frecuente -> toque 2: categoría -> guardado (hoy, en su moneda).
// Si el botón ya tiene categoría asignada, se guarda con un solo toque.
// Después de guardar se puede deshacer durante unos segundos.

const UNDO_TIMEOUT_MS = 5000;

export function QuickAdd() {
  const theme = useTheme();
  const router = useRouter();
  const quickAmounts = useQuickAmounts();
  const categories = useCategories();
  const createMovement = useCreateMovement();
  const deleteMovement = useDeleteMovement();

  const [selected, setSelected] = useState<QuickAmount | null>(null);
  const [lastSaved, setLastSaved] = useState<{ movement: Movement; categoryName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const expenseCategories = (categories.data ?? []).filter((category) => category.type === 'expense');
  const categoryName = (id: string) => categories.data?.find((category) => category.id === id)?.name ?? 'Sin categoría';

  async function save(amount: QuickAmount, category: Pick<Category, 'id' | 'name'>) {
    setError(null);
    try {
      const movement = await createMovement.mutateAsync({
        type: 'expense',
        categoryId: category.id,
        amountOriginal: amount.amount,
        currency: amount.currency,
        occurredOn: todayInLima(),
      });
      setSelected(null);
      setLastSaved({ movement, categoryName: category.name });
      if (undoTimer.current) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setLastSaved(null), UNDO_TIMEOUT_MS);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'No se pudo guardar');
    }
  }

  function onAmountPress(amount: QuickAmount) {
    if (amount.categoryId) {
      void save(amount, { id: amount.categoryId, name: categoryName(amount.categoryId) });
      return;
    }
    setSelected((current) => (current?.id === amount.id ? null : amount));
  }

  async function undo() {
    if (!lastSaved) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const { movement } = lastSaved;
    setLastSaved(null);
    await deleteMovement.mutateAsync(movement.id).catch(() => setError('No se pudo deshacer'));
  }

  return (
    <Card style={{ gap: spacing.md }}>
      <Text style={[styles.title, { color: theme.text }]}>Registrar gasto</Text>

      <View style={styles.row}>
        {(quickAmounts.data ?? []).map((amount) => (
          <Chip
            key={amount.id}
            large
            label={`${amount.currency === 'USD' ? 'US$ ' : ''}${formatShortAmount(amount.amount)}`}
            selected={selected?.id === amount.id}
            onPress={() => onAmountPress(amount)}
          />
        ))}
        <Chip large label="Otro" onPress={() => router.push('/add')} />
      </View>

      {selected ? (
        <View style={{ gap: spacing.sm }}>
          <Muted>
            ¿En qué gastaste {currencySymbol(selected.currency)} {formatShortAmount(selected.amount)}?
          </Muted>
          <View style={styles.row}>
            {expenseCategories.map((category) => (
              <Chip
                key={category.id}
                label={category.name}
                color={category.color}
                onPress={() => void save(selected, category)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {createMovement.isPending ? <Muted>Guardando…</Muted> : null}
      {error ? <Text style={{ color: theme.danger }}>{error}</Text> : null}

      {lastSaved ? (
        <View style={[styles.toast, { backgroundColor: theme.primarySoft }]}>
          <Text style={{ color: theme.text, flex: 1 }}>
            ✓ {formatMoney(lastSaved.movement.amountOriginal, lastSaved.movement.currency)} en {lastSaved.categoryName}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => void undo()}>
            <Text style={{ color: theme.primary, fontWeight: '700' }}>Deshacer</Text>
          </Pressable>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
