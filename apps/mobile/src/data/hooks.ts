import { computeDailyTotals, computeDashboard, computeDebtBalances, todayInLima, type DebtBalance } from '@justipe/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Category, Debt, Movement } from '../api/types';
import { monthRange } from '../lib/format';
import { localDb } from '../offline/localDb';
import * as mutations from '../offline/mutations';

// Capa de datos de la app sobre TanStack Query.
// Las consultas leen la copia local (MMKV): responden al instante y funcionan sin red.
// El motor de sincronización invalida ['local'] cuando llegan cambios del servidor.

function useLocalQuery<T>(key: readonly unknown[], read: () => T) {
  return useQuery({ queryKey: ['local', ...key], queryFn: read, staleTime: Infinity, networkMode: 'always' });
}

const byOrderThenName = (a: { sortOrder: number; name: string }, b: { sortOrder: number; name: string }) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

// Del más reciente al más antiguo
const byDateDesc = (a: Movement, b: Movement) => b.occurredOn.localeCompare(a.occurredOn) || b.createdAt.localeCompare(a.createdAt);

export function useCategories() {
  return useLocalQuery(['categories'], () => localDb.all('categories').sort(byOrderThenName));
}

export function useCategoryMap(): Map<string, Category> {
  // Incluye categorías borradas para seguir mostrando el nombre en movimientos antiguos
  const { data } = useLocalQuery(['categoryMap'], () => localDb.allWithDeleted('categories'));
  return new Map((data ?? []).map((category) => [category.id, category]));
}

export function useQuickAmounts() {
  return useLocalQuery(['quickAmounts'], () =>
    localDb.all('quickAmounts').sort((a, b) => a.sortOrder - b.sortOrder || Number(a.amount) - Number(b.amount)),
  );
}

export function useMovements(month: string) {
  return useLocalQuery(['movements', month], () => {
    const { from, to } = monthRange(month);
    return localDb
      .all('movements')
      .filter((m) => m.occurredOn >= from && m.occurredOn <= to)
      .sort(byDateDesc);
  });
}

function latestUsdRate(today: string): string | null {
  const rate = localDb
    .all('exchangeRates')
    .filter((r) => r.rateDate <= today)
    .sort((a, b) => b.rateDate.localeCompare(a.rateDate))[0];
  return rate?.sell ?? null;
}

// Mismo cálculo que GET /dashboard, hecho en el teléfono
export function useDashboard(month: string) {
  return useLocalQuery(['dashboard', month], () => {
    const today = todayInLima();
    return computeDashboard({
      month,
      today,
      movements: localDb.all('movements'),
      recurring: localDb.all('recurring'),
      usdRate: latestUsdRate(today),
    });
  });
}

export function useDailyTotals(month: string) {
  return useLocalQuery(['dailyTotals', month], () => computeDailyTotals(localDb.all('movements'), month));
}

export interface DebtWithBalance extends Debt, DebtBalance {}

export function useDebts() {
  return useLocalQuery(['debts'], (): DebtWithBalance[] => {
    const debts = localDb.all('debts');
    const balances = computeDebtBalances(debts, localDb.all('movements'));
    return debts
      .map((debt) => ({ ...debt, ...(balances[debt.id] ?? { paidAmount: '0.00', balance: debt.initialAmount }) }))
      .sort((a, b) => (a.expectedOn ?? '9999').localeCompare(b.expectedOn ?? '9999') || a.createdAt.localeCompare(b.createdAt));
  });
}

export function useDebt(id: string) {
  const debts = useDebts();
  return debts.data?.find((debt) => debt.id === id);
}

export function useDebtPayments(debtId: string) {
  return useLocalQuery(['debtPayments', debtId], () =>
    localDb
      .all('movements')
      .filter((m) => m.debtId === debtId)
      .sort(byDateDesc),
  );
}

// --- Mutaciones: escriben local + outbox; la UI se refresca al instante ---

function useLocalMutation<TInput, TResult>(fn: (input: TInput) => TResult) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TInput) => fn(input),
    networkMode: 'always',
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['local'] }),
  });
}

export const useCreateMovement = () => useLocalMutation(mutations.createMovement);
export const useDeleteMovement = () => useLocalMutation(mutations.deleteMovement);
export const useCreateDebt = () => useLocalMutation(mutations.createDebt);
export const useUpdateDebt = () =>
  useLocalMutation(({ id, changes }: { id: string; changes: mutations.DebtChanges }) => mutations.updateDebt(id, changes));
export const useDeleteDebt = () => useLocalMutation(mutations.deleteDebt);
export const useCreateQuickAmount = () => useLocalMutation(mutations.createQuickAmount);
export const useDeleteQuickAmount = () => useLocalMutation(mutations.deleteQuickAmount);
