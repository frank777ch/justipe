import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSyncState } from '../offline/SyncProvider';
import { syncEngine } from '../offline/syncEngine';
import { radius, spacing, useTheme } from '../theme';

// Aviso del estado de sincronización. No muestra nada si todo está al día.
export function SyncBanner() {
  const theme = useTheme();
  const sync = useSyncState();

  if (sync.failed.length > 0) {
    const first = sync.failed[0]!;
    return (
      <View style={[styles.banner, { backgroundColor: theme.surfaceMuted, borderColor: theme.danger }]}>
        <Ionicons name="alert-circle-outline" size={18} color={theme.danger} />
        <Text style={[styles.text, { color: theme.text }]}>
          {sync.failed.length === 1 ? 'Un cambio no se pudo guardar' : `${sync.failed.length} cambios no se pudieron guardar`}: {first.message}
        </Text>
        <Pressable hitSlop={8} onPress={() => syncEngine.dismissFailed()} accessibilityRole="button">
          <Text style={{ color: theme.primary, fontWeight: '700' }}>OK</Text>
        </Pressable>
      </View>
    );
  }

  if (sync.status === 'offline') {
    return (
      <View style={[styles.banner, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
        <Ionicons name="cloud-offline-outline" size={18} color={theme.textMuted} />
        <Text style={[styles.text, { color: theme.text }]}>
          Sin conexión
          {sync.pending > 0 ? ` · ${sync.pending} cambio(s) se enviarán al reconectar` : ' · mostrando datos guardados'}
        </Text>
      </View>
    );
  }

  if (sync.status === 'error' && sync.lastError) {
    return (
      <View style={[styles.banner, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
        <Ionicons name="warning-outline" size={18} color={theme.expense} />
        <Text style={[styles.text, { color: theme.text }]}>No se pudo sincronizar: {sync.lastError}</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: 13,
  },
});
