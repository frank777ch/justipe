import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ApiRequestError } from '../src/api/client';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { LoadingView } from '../src/components/ui';
import { SyncProvider } from '../src/offline/SyncProvider';
import { useTheme } from '../src/theme';

// Layout raíz: proveedores globales y navegación protegida por sesión
export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Los datos se leen de la copia local: no dependen de la red
          mutations: { networkMode: 'always' },
          queries: {
            networkMode: 'always',
            staleTime: 30_000,
            // No reintentar errores del cliente (401, 404, 422): solo fallos de red o servidor
            retry: (failureCount, error) =>
              failureCount < 2 && (!(error instanceof ApiRequestError) || error.status === 0 || error.status >= 500),
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SyncProvider>
          <RootNavigator />
        </SyncProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootNavigator() {
  const { status } = useAuth();
  const theme = useTheme();
  if (status === 'loading') return <LoadingView />;
  const signedIn = status === 'signedIn';

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.background },
          headerStyle: { backgroundColor: theme.surface },
          headerTintColor: theme.text,
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add" options={{ presentation: 'modal', headerShown: true, title: 'Nuevo movimiento' }} />
          <Stack.Screen name="debt/new" options={{ presentation: 'modal', headerShown: true, title: 'Nueva deuda' }} />
          <Stack.Screen name="debt/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Deuda' }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
