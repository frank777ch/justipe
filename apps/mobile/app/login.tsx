import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ApiRequestError } from '../src/api/client';
import { useAuth } from '../src/auth/AuthProvider';
import { Button, Muted } from '../src/components/ui';
import { radius, spacing, useTheme } from '../src/theme';

// Inicio de sesión: URL del servidor + contraseña del único usuario
export default function LoginScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { apiUrl, login } = useAuth();
  const [url, setUrl] = useState(apiUrl);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      await login(url, password);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = [styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top + 48 }]}
    >
      <View style={{ gap: spacing.xs }}>
        <Text style={[styles.brand, { color: theme.primary }]}>Justipe</Text>
        <Muted style={{ fontSize: 15 }}>Tus gastos, al día.</Muted>
      </View>

      <View style={{ gap: spacing.md }}>
        <Text style={[styles.label, { color: theme.textMuted }]}>Servidor</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          placeholder="https://gastos.tudominio.com"
          placeholderTextColor={theme.textMuted}
          style={inputStyle}
        />
        <Text style={[styles.label, { color: theme.textMuted }]}>Contraseña</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          onSubmitEditing={() => void submit()}
          returnKeyType="go"
          style={inputStyle}
        />
        {error ? <Text style={{ color: theme.danger }}>{error}</Text> : null}
        <Button label="Entrar" onPress={() => void submit()} loading={loading} disabled={!password} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    gap: 40,
  },
  brand: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: -spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
  },
});
