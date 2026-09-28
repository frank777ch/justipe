import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Almacenamiento de valores pequeños y sensibles (token, URL de la API).
// En el móvil usa el llavero del sistema (Keychain / Keystore) vía expo-secure-store;
// en la versión web, que es solo para vista previa, cae a localStorage.

const isWeb = Platform.OS === 'web';

export const storageKeys = {
  token: 'justipe.token',
  apiUrl: 'justipe.apiUrl',
} as const;

export async function getItem(key: string): Promise<string | null> {
  if (isWeb) return globalThis.localStorage?.getItem(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function removeItem(key: string): Promise<void> {
  if (isWeb) {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
