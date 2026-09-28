import { isValidIsoDate, moneySchema, type Currency, type DebtDirection } from '@justipe/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Chip, Muted } from '../../src/components/ui';
import { useCreateDebt } from '../../src/data/hooks';
import { radius, spacing, useTheme } from '../../src/theme';

// Alta de una deuda (lo que debo) o de un préstamo por cobrar (lo que me deben)
export default function NewDebtScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ direction?: DebtDirection }>();
  const createDebt = useCreateDebt();

  const [direction, setDirection] = useState<DebtDirection>(params.direction === 'owed_to_me' ? 'owed_to_me' : 'i_owe');
  const [counterparty, setCounterparty] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>('PEN');
  const [installment, setInstallment] = useState('');
  const [expectedOn, setExpectedOn] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isMine = direction === 'i_owe';

  async function save() {
    if (!counterparty.trim()) return setError(isMine ? '¿A quién le debes?' : '¿Quién te debe?');
    const parsedAmount = moneySchema.safeParse(amount.replace(',', '.'));
    if (!parsedAmount.success) return setError('Monto inválido');
    let parsedInstallment: string | null = null;
    if (installment.trim()) {
      const result = moneySchema.safeParse(installment.replace(',', '.'));
      if (!result.success) return setError('Cuota inválida');
      parsedInstallment = result.data;
    }
    if (expectedOn.trim() && !isValidIsoDate(expectedOn.trim())) return setError('Fecha inválida, usa AAAA-MM-DD');
    setError(null);
    await createDebt.mutateAsync({
      direction,
      counterparty: counterparty.trim(),
      description: description.trim() || null,
      initialAmount: parsedAmount.data,
      currency,
      installment: parsedInstallment,
      expectedOn: expectedOn.trim() || null,
    });
    router.back();
  }

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }];

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.row}>
        <Chip label="Lo que debo" selected={isMine} onPress={() => setDirection('i_owe')} style={styles.flex} />
        <Chip label="Me deben" selected={!isMine} onPress={() => setDirection('owed_to_me')} style={styles.flex} />
      </View>

      <Muted>{isMine ? 'Acreedor (banco, tienda, persona)' : 'Persona'}</Muted>
      <TextInput value={counterparty} onChangeText={setCounterparty} placeholder={isMine ? 'Banco' : 'Juan'} placeholderTextColor={theme.textMuted} style={inputStyle} maxLength={100} />

      <Muted>{isMine ? 'Saldo que debes' : 'Monto que te deben'}</Muted>
      <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.textMuted} style={inputStyle} />
      <View style={styles.row}>
        <Chip label="Soles (S/)" selected={currency === 'PEN'} onPress={() => setCurrency('PEN')} />
        <Chip label="Dólares (US$)" selected={currency === 'USD'} onPress={() => setCurrency('USD')} />
      </View>

      {isMine ? (
        <>
          <Muted>Cuota mensual (opcional)</Muted>
          <TextInput value={installment} onChangeText={setInstallment} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.textMuted} style={inputStyle} />
        </>
      ) : null}

      <Muted>{isMine ? 'Fecha límite (opcional)' : 'Fecha estimada de pago (opcional)'}</Muted>
      <TextInput value={expectedOn} onChangeText={setExpectedOn} placeholder="AAAA-MM-DD" placeholderTextColor={theme.textMuted} style={inputStyle} />

      <Muted>Descripción (opcional)</Muted>
      <TextInput value={description} onChangeText={setDescription} placeholder={isMine ? 'Préstamo personal' : 'Le presté para el pasaje'} placeholderTextColor={theme.textMuted} style={inputStyle} maxLength={500} />

      {error ? <Text style={{ color: theme.danger }}>{error}</Text> : null}
      <Button label="Guardar" onPress={() => void save()} />
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
  },
  flex: {
    flex: 1,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 16,
  },
});
