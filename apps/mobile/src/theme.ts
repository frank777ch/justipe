import { useColorScheme } from 'react-native';

// Paleta de la app en modo claro y oscuro
const light = {
  background: '#F4F5F7',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF0F3',
  border: '#E1E4E8',
  text: '#15181D',
  textMuted: '#626B77',
  primary: '#0F766E',
  primaryText: '#FFFFFF',
  primarySoft: '#DDF3F0',
  income: '#15803D',
  expense: '#C2410C',
  danger: '#B91C1C',
  hero: '#0F766E',
  heroText: '#FFFFFF',
  heroMuted: '#B9E4DF',
};

const dark: typeof light = {
  background: '#0E1114',
  surface: '#171B20',
  surfaceMuted: '#1F252C',
  border: '#2A3139',
  text: '#EEF1F4',
  textMuted: '#9AA4AF',
  primary: '#2DD4BF',
  primaryText: '#062A26',
  primarySoft: '#133530',
  income: '#4ADE80',
  expense: '#FB923C',
  danger: '#F87171',
  hero: '#134E48',
  heroText: '#F0FDFA',
  heroMuted: '#99D5CC',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
