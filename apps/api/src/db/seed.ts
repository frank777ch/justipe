import { queryClient, db } from './client.js';
import { categories, quickAmounts, type NewCategory, type NewQuickAmount } from './schema/index.js';

// Datos iniciales. Los ids son fijos para que el seed sea idempotente:
// puedes correrlo varias veces sin duplicar nada ni pisar tus cambios.

const initialCategories: NewCategory[] = [
  { id: '00000000-0000-7000-8000-000000000101', name: 'Comida', type: 'expense', icon: 'utensils', color: '#E4572E', sortOrder: 1 },
  { id: '00000000-0000-7000-8000-000000000102', name: 'Transporte', type: 'expense', icon: 'bus', color: '#17BEBB', sortOrder: 2 },
  { id: '00000000-0000-7000-8000-000000000103', name: 'Supermercado', type: 'expense', icon: 'shopping-cart', color: '#76B041', sortOrder: 3 },
  { id: '00000000-0000-7000-8000-000000000104', name: 'Servicios', type: 'expense', icon: 'bolt', color: '#FFC914', sortOrder: 4 },
  { id: '00000000-0000-7000-8000-000000000105', name: 'Vivienda', type: 'expense', icon: 'home', color: '#8E7DBE', sortOrder: 5 },
  { id: '00000000-0000-7000-8000-000000000106', name: 'Salud', type: 'expense', icon: 'heart-pulse', color: '#D1495B', sortOrder: 6 },
  { id: '00000000-0000-7000-8000-000000000107', name: 'Entretenimiento', type: 'expense', icon: 'film', color: '#2E86AB', sortOrder: 7 },
  { id: '00000000-0000-7000-8000-000000000108', name: 'Deudas', type: 'expense', icon: 'credit-card', color: '#6C757D', sortOrder: 8 },
  { id: '00000000-0000-7000-8000-000000000109', name: 'Otros', type: 'expense', icon: 'ellipsis', color: '#ADB5BD', sortOrder: 99 },
  { id: '00000000-0000-7000-8000-000000000201', name: 'Sueldo', type: 'income', icon: 'briefcase', color: '#2A9D8F', sortOrder: 1 },
  { id: '00000000-0000-7000-8000-000000000202', name: 'Freelance', type: 'income', icon: 'laptop', color: '#264653', sortOrder: 2 },
  { id: '00000000-0000-7000-8000-000000000203', name: 'Cobro de deudas', type: 'income', icon: 'hand-coins', color: '#E9C46A', sortOrder: 3 },
  { id: '00000000-0000-7000-8000-000000000209', name: 'Otros ingresos', type: 'income', icon: 'ellipsis', color: '#ADB5BD', sortOrder: 99 },
];

const initialQuickAmounts: NewQuickAmount[] = [
  { id: '00000000-0000-7000-8000-000000000301', amount: '4.00', currency: 'PEN', sortOrder: 1 },
  { id: '00000000-0000-7000-8000-000000000302', amount: '13.00', currency: 'PEN', sortOrder: 2 },
  { id: '00000000-0000-7000-8000-000000000303', amount: '6.00', currency: 'PEN', sortOrder: 3 },
  { id: '00000000-0000-7000-8000-000000000304', amount: '2.46', currency: 'PEN', sortOrder: 4 },
];

async function seed(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(categories).values(initialCategories).onConflictDoNothing();
    await tx.insert(quickAmounts).values(initialQuickAmounts).onConflictDoNothing();
  });
}

try {
  await seed();
  console.log('Seed aplicado');
} catch (error) {
  console.error('Error aplicando el seed:', error);
  process.exitCode = 1;
} finally {
  await queryClient.end();
}
