import { moneySchema } from '@justipe/shared';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCategories, useCreateQuickAmount, useDeleteQuickAmount, useQuickAmounts } from '../../src/api/hooks';
import { useAuth } from '../../src/auth/AuthProvider';
import { Button, Card, Chip, confirmAction, Muted, SectionTitle } from '../../src/components/ui';
import { formatMoney } from '../../src/lib/format';
import { radius, spacing, useTheme } from '../../src/theme';

// Ajustes: montos rápidos configurables, servidor y cierre de sesión
export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { apiUrl, logout } = useAuth();
  const quickAmounts = useQuickAmounts();
  const categories = useCategories();
  const createQuickAmount = useCreateQuickAmount();
  const deleteQuickAmount = useDeleteQuickAmount();

  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expenseCategories = (categories.data ?? []).filter((category) => category.type === 'expense');
  const categoryName = (id: string | null) => (id ? categories.data?.find((c) => c.id === id)?.name : undefined);

  async function addQuickAmount() {
    const parsed = moneySchema.safeParse(amount.replace(',', '.'));
    if (!parsed.success) {
      setError('Monto inválido');
      return;
    }
    setError(null);
    const nextOrder = Math.max(0, ...(quickAmounts.data ?? []).map((q) => q.sortOrder)) + 1;
    await createQuickAmount
      .mutateAsync({ amount: parsed.data, currency: 'PEN', categoryId, sortOrder: nextOrder })
      .then(() => {
        setAmount('');
        setCategoryId(null);
      })
      .catch((e: Error) => setError(e.message));
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: theme.text }]}>Ajustes</Text>

      <SectionTitle>Montos rápidos</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        <Muted>Aparecen en el inicio para registrar un gasto con 2 toques. Con categoría fija, con 1 solo toque.</Muted>
        {(quickAmounts.data ?? []).map((quickAmount) => (
          <View key={quickAmount.id} style={styles.quickRow}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600', flex: 1 }}>
              {formatMoney(quickAmount.amount, quickAmount.currency)}
              {quickAmount.categoryId ? (
                <Text style={{ color: theme.textMuted, fontWeight: '400' }}> · {categoryName(quickAmount.categoryId)}</Text>
              ) : null}
            </Text>
            <Pressable
              accessibilityLabel="Quitar monto"
              hitSlop={10}
              onPress={() =>
                confirmAction('Quitar monto rápido', formatMoney(quickAmount.amount, quickAmount.currency), 'Quitar', () =>
                  deleteQuickAmount.mutate(quickAmount.id),
                )
              }
            >
              <Text style={{ color: theme.danger, fontWeight: '600' }}>Quitar</Text>
            </Pressable>
          </View>
        ))}

        <View style={[styles.divider, { backgroundColor: theme.border }]} />
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="Nuevo monto, ej: 8.50"
          placeholderTextColor={theme.textMuted}
          style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        />
        <Muted>Categoría fija (opcional)</Muted>
        <View style={styles.chips}>
          {expenseCategories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              color={category.color}
              selected={categoryId === category.id}
              onPress={() => setCategoryId((current) => (current === category.id ? null : category.id))}
            />
          ))}
        </View>
        {error ? <Text style={{ color: theme.danger }}>{error}</Text> : null}
        <Button label="Agregar monto" onPress={() => void addQuickAmount()} disabled={!amount} loading={createQuickAmount.isPending} />
      </Card>

      <SectionTitle>Servidor</SectionTitle>
      <Card style={{ gap: spacing.md }}>
        <Text style={{ color: theme.text }} selectable>
          {apiUrl}
        </Text>
        <Button label="Cerrar sesión" variant="secondary" onPress={() => void logout()} />
      </Card>
    </ScrollView>
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
  quickRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
