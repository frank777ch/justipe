import { exchangeRateSchema, moneySchema, type Currency, type MovementType } from '@justipe/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiRequestError } from '../src/api/client';
import { useCategories, useCreateMovement } from '../src/api/hooks';
import { Button, Chip, Muted } from '../src/components/ui';
import { addDays, currencySymbol, todayInLima } from '../src/lib/format';
import { radius, spacing, useTheme } from '../src/theme';

// Registro completo: gasto o ingreso, cualquier monto, moneda, fecha y nota
export default function AddMovementScreen() {
  const theme = useTheme();
  const router = useRouter();
  const categories = useCategories();
  const createMovement = useCreateMovement();

  const today = todayInLima();
  const [type, setType] = useState<MovementType>('expense');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('PEN');
  const [exchangeRate, setExchangeRate] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [occurredOn, setOccurredOn] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const visibleCategories = (categories.data ?? []).filter((category) => category.type === type);

  function changeType(next: MovementType) {
    setType(next);
    setCategoryId(null);
  }

  async function save() {
    const parsedAmount = moneySchema.safeParse(amount.replace(',', '.'));
    if (!parsedAmount.success) return setError('Ingresa un monto válido');
    if (!categoryId) return setError('Elige una categoría');
    let rate: string | undefined;
    if (currency === 'USD' && exchangeRate.trim() !== '') {
      const parsedRate = exchangeRateSchema.safeParse(exchangeRate.replace(',', '.'));
      if (!parsedRate.success) return setError('Tipo de cambio inválido');
      rate = parsedRate.data;
    }
    setError(null);
    try {
      await createMovement.mutateAsync({
        type,
        categoryId,
        amountOriginal: parsedAmount.data,
        currency,
        exchangeRate: rate,
        occurredOn,
        note: note.trim() || null,
      });
      router.back();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'No se pudo guardar');
    }
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }];

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.row}>
        <Chip label="Gasto" selected={type === 'expense'} onPress={() => changeType('expense')} style={styles.flex} />
        <Chip label="Ingreso" selected={type === 'income'} onPress={() => changeType('income')} style={styles.flex} />
      </View>

      <View style={[styles.amountBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Text style={[styles.currencySymbol, { color: theme.textMuted }]}>{currencySymbol(currency)}</Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={theme.textMuted}
          // En web el foco automático desplaza la vista durante la animación del modal
          autoFocus={Platform.OS !== 'web'}
          style={[styles.amountInput, { color: theme.text }]}
        />
      </View>

      <View style={styles.row}>
        <Chip label="Soles (S/)" selected={currency === 'PEN'} onPress={() => setCurrency('PEN')} />
        <Chip label="Dólares (US$)" selected={currency === 'USD'} onPress={() => setCurrency('USD')} />
      </View>
      {currency === 'USD' ? (
        <View style={{ gap: spacing.xs }}>
          <TextInput
            value={exchangeRate}
            onChangeText={setExchangeRate}
            keyboardType="decimal-pad"
            placeholder="Tipo de cambio (vacío = SUNAT del día)"
            placeholderTextColor={theme.textMuted}
            style={inputStyle}
          />
        </View>
      ) : null}

      <Muted>Categoría</Muted>
      <View style={styles.wrap}>
        {visibleCategories.map((category) => (
          <Chip
            key={category.id}
            label={category.name}
            color={category.color}
            selected={categoryId === category.id}
            onPress={() => setCategoryId(category.id)}
          />
        ))}
      </View>

      <Muted>Fecha</Muted>
      <View style={styles.row}>
        <Chip label="Hoy" selected={occurredOn === today} onPress={() => setOccurredOn(today)} />
        <Chip label="Ayer" selected={occurredOn === addDays(today, -1)} onPress={() => setOccurredOn(addDays(today, -1))} />
        <TextInput
          value={occurredOn}
          onChangeText={setOccurredOn}
          placeholder="AAAA-MM-DD"
          placeholderTextColor={theme.textMuted}
          style={[inputStyle, styles.flex, { paddingVertical: 8, minWidth: 0 }]}
        />
      </View>

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Nota (opcional)"
        placeholderTextColor={theme.textMuted}
        style={inputStyle}
        maxLength={500}
      />

      {error ? <Text style={{ color: theme.danger }}>{error}</Text> : null}
      <Button label="Guardar" onPress={() => void save()} loading={createMovement.isPending} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: 48,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
    justifyContent: 'center',
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '600',
  },
  amountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: '700',
    paddingVertical: spacing.md,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
  },
});
