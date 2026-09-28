import type { ExchangeRateProvider } from './services/exchange-rate.js';

// Configuración que necesita la aplicación Hono. Se inyecta en createApp para que
// los tests puedan construir la app con sus propios valores sin tocar process.env.
export interface AppConfig {
  jwtSecret: string;
  // Hash scrypt de la contraseña del único usuario (ver pnpm hash-password)
  passwordHash: string;
  // Vigencia del JWT en días
  tokenTtlDays: number;
  // Fuente del tipo de cambio; si falta, POST /exchange-rates/sync responde 503
  exchangeRateProvider?: ExchangeRateProvider;
}
