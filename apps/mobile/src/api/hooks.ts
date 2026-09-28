import type { Currency, MovementType } from '@justipe/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useAuth } from '../auth/AuthProvider';
import { monthRange } from '../lib/format';
import type { Category, DashboardSummary, Movement, QuickAmount } from './types';

// Consultas y mutaciones de TanStack Query sobre la API.
// Claves: ['categories'], ['quick-amounts'], ['dashboard', mes], ['movements', mes]

export const queryKeys = {
  categories: ['categories'] as const,
  quickAmounts: ['quick-amounts'] as const,
  dashboard: (month: string) => ['dashboard', month] as const,
  movements: (month: string) => ['movements', month] as const,
};

export function useCategories() {
  const { api } = useAuth();
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api<Category[]>('GET', '/categories'),
    staleTime: 5 * 60 * 1000,
  });
}

// Mapa id -> categoría para mostrar nombres en listados
export function useCategoryMap(): Map<string, Category> {
  const { data } = useCategories();
  return new Map((data ?? []).map((category) => [category.id, category]));
}

export function useQuickAmounts() {
  const { api } = useAuth();
  return useQuery({
    queryKey: queryKeys.quickAmounts,
    queryFn: () => api<QuickAmount[]>('GET', '/quick-amounts'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useDashboard(month: string) {
  const { api } = useAuth();
  return useQuery({
    queryKey: queryKeys.dashboard(month),
    queryFn: () => api<DashboardSummary>('GET', `/dashboard?month=${month}`),
  });
}

export function useMovements(month: string) {
  const { api } = useAuth();
  const { from, to } = monthRange(month);
  return useQuery({
    queryKey: queryKeys.movements(month),
    queryFn: () => api<Movement[]>('GET', `/movements?from=${from}&to=${to}&limit=500`),
  });
}

export interface NewMovement {
  type: MovementType;
  categoryId: string;
  amountOriginal: string;
  currency: Currency;
  exchangeRate?: string;
  occurredOn: string;
  note?: string | null;
}

// Tras cualquier cambio en movimientos se refrescan dashboard y listados
function useInvalidateMovements() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['movements'] }),
    ]);
}

export function useCreateMovement() {
  const { api } = useAuth();
  const invalidate = useInvalidateMovements();
  return useMutation({
    // El id se genera en el teléfono: si se reintenta, la API no duplica
    mutationFn: (input: NewMovement) => api<Movement>('POST', '/movements', { id: randomUUID(), ...input }),
    onSuccess: invalidate,
  });
}

export function useDeleteMovement() {
  const { api } = useAuth();
  const invalidate = useInvalidateMovements();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/movements/${id}`),
    onSuccess: invalidate,
  });
}

export function useCreateQuickAmount() {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { amount: string; currency: Currency; categoryId: string | null; sortOrder: number }) =>
      api<QuickAmount>('POST', '/quick-amounts', { id: randomUUID(), ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.quickAmounts }),
  });
}

export function useDeleteQuickAmount() {
  const { api } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/quick-amounts/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.quickAmounts }),
  });
}
