import { beforeEach, describe, expect, it } from 'vitest';
import { createCategory, setupTestContext } from '../test/helpers.js';

const ctx = await setupTestContext();

let debtExpenseCategoryId: string;
let debtIncomeCategoryId: string;

beforeEach(async () => {
  debtExpenseCategoryId = await createCategory(ctx, 'Deudas', 'expense');
  debtIncomeCategoryId = await createCategory(ctx, 'Cobro de deudas', 'income');
});

async function createLoan() {
  const response = await ctx.post('/debts', {
    direction: 'i_owe',
    counterparty: 'Banco',
    description: 'Préstamo personal',
    initialAmount: 5000,
    installment: 450,
  });
  expect(response.status).toBe(201);
  return response.body;
}

describe('deudas', () => {
  it('crea una deuda con saldo inicial completo', async () => {
    const debt = await createLoan();
    expect(debt).toMatchObject({
      direction: 'i_owe',
      currency: 'PEN',
      initialAmount: '5000.00',
      installment: '450.00',
      paidAmount: '0.00',
      balance: '5000.00',
    });
  });

  it('los pagos (gastos con debtId) reducen el saldo; los borrados no cuentan', async () => {
    const debt = await createLoan();
    const pay = (amountOriginal: number) =>
      ctx.post('/movements', {
        type: 'expense',
        categoryId: debtExpenseCategoryId,
        amountOriginal,
        occurredOn: '2026-09-28',
        debtId: debt.id,
      });
    await pay(450);
    const second = await pay(450);
    expect((await ctx.get(`/debts/${debt.id}`)).body).toMatchObject({ paidAmount: '900.00', balance: '4100.00' });

    await ctx.del(`/movements/${second.body.id}`);
    expect((await ctx.get(`/debts/${debt.id}`)).body).toMatchObject({ paidAmount: '450.00', balance: '4550.00' });

    const payments = await ctx.get(`/movements?debtId=${debt.id}`);
    expect(payments.body).toHaveLength(1);
  });

  it('lo que me deben se cobra con ingresos', async () => {
    const owed = await ctx.post('/debts', {
      direction: 'owed_to_me',
      counterparty: 'Juan',
      initialAmount: 300,
      expectedOn: '2026-10-15',
    });
    expect(owed.body.expectedOn).toBe('2026-10-15');

    const asExpense = await ctx.post('/movements', {
      type: 'expense', categoryId: debtExpenseCategoryId, amountOriginal: 100, occurredOn: '2026-09-28', debtId: owed.body.id,
    });
    expect(asExpense.status).toBe(422);
    expect(asExpense.body.error.code).toBe('debt_type_mismatch');

    await ctx.post('/movements', {
      type: 'income', categoryId: debtIncomeCategoryId, amountOriginal: 100, occurredOn: '2026-09-28', debtId: owed.body.id,
    });
    expect((await ctx.get(`/debts/${owed.body.id}`)).body.balance).toBe('200.00');
  });

  it('el pago debe estar en la moneda de la deuda', async () => {
    const debt = await createLoan();
    const response = await ctx.post('/movements', {
      type: 'expense',
      categoryId: debtExpenseCategoryId,
      amountOriginal: 100,
      currency: 'USD',
      exchangeRate: 3.7,
      occurredOn: '2026-09-28',
      debtId: debt.id,
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('debt_currency_mismatch');
  });

  it('lista por estado y dirección', async () => {
    const loan = await createLoan();
    await ctx.post('/debts', { direction: 'owed_to_me', counterparty: 'Ana', initialAmount: 50 });
    await ctx.patch(`/debts/${loan.id}`, { closedOn: '2026-09-28' });

    expect((await ctx.get('/debts')).body.map((d: { counterparty: string }) => d.counterparty)).toEqual(['Ana']);
    expect((await ctx.get('/debts?status=closed')).body.map((d: { counterparty: string }) => d.counterparty)).toEqual(['Banco']);
    expect((await ctx.get('/debts?status=all')).body).toHaveLength(2);
    expect((await ctx.get('/debts?status=all&direction=i_owe')).body).toHaveLength(1);
  });

  it('actualiza datos pero no la dirección ni la moneda', async () => {
    const debt = await createLoan();
    const updated = await ctx.patch(`/debts/${debt.id}`, { installment: 500, direction: 'owed_to_me', currency: 'USD' });
    expect(updated.body).toMatchObject({ installment: '500.00', direction: 'i_owe', currency: 'PEN' });
  });

  it('borrado lógico', async () => {
    const debt = await createLoan();
    expect((await ctx.del(`/debts/${debt.id}`)).status).toBe(204);
    expect((await ctx.get(`/debts/${debt.id}`)).status).toBe(404);
  });
});
