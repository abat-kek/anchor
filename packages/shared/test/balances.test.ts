import { describe, it, expect } from 'vitest';
import { computeBalances, simplifyDebts } from '../src/domain/balances';
import type { Expense, ExpenseSplit, Balance } from '../src/types';

describe('computeBalances', () => {
  it('computes correct net balances for two-person split', () => {
    const expenses: Expense[] = [
      { id: 'e1', payerParticipantId: 'alice', amountCents: 10000, currency: 'EUR' },
    ];
    const splits: ExpenseSplit[] = [
      { expenseId: 'e1', participantId: 'alice', shareCents: 5000 },
      { expenseId: 'e1', participantId: 'bob', shareCents: 5000 },
    ];
    const balances = computeBalances(expenses, splits);
    expect(balances).toEqual([
      { participantId: 'alice', netCents: 5000 },
      { participantId: 'bob', netCents: -5000 },
    ]);
  });

  it('sums multiple expenses correctly', () => {
    const expenses: Expense[] = [
      { id: 'e1', payerParticipantId: 'alice', amountCents: 6000, currency: 'EUR' },
      { id: 'e2', payerParticipantId: 'bob', amountCents: 4000, currency: 'EUR' },
    ];
    const splits: ExpenseSplit[] = [
      { expenseId: 'e1', participantId: 'alice', shareCents: 3000 },
      { expenseId: 'e1', participantId: 'bob', shareCents: 3000 },
      { expenseId: 'e2', participantId: 'alice', shareCents: 2000 },
      { expenseId: 'e2', participantId: 'bob', shareCents: 2000 },
    ];
    const balances = computeBalances(expenses, splits);
    // alice: paid 6000, owes (3000+2000)=5000 → net=1000
    // bob: paid 4000, owes (3000+2000)=5000 → net=-1000
    expect(balances).toContainEqual({ participantId: 'alice', netCents: 1000 });
    expect(balances).toContainEqual({ participantId: 'bob', netCents: -1000 });
  });

  it('handles three-person scenario with complex splits', () => {
    const expenses: Expense[] = [
      { id: 'e1', payerParticipantId: 'alice', amountCents: 9000, currency: 'EUR' },
    ];
    const splits: ExpenseSplit[] = [
      { expenseId: 'e1', participantId: 'alice', shareCents: 3000 },
      { expenseId: 'e1', participantId: 'bob', shareCents: 3000 },
      { expenseId: 'e1', participantId: 'charlie', shareCents: 3000 },
    ];
    const balances = computeBalances(expenses, splits);
    // alice: paid 9000, owes 3000 → net=6000
    // bob: paid 0, owes 3000 → net=-3000
    // charlie: paid 0, owes 3000 → net=-3000
    expect(balances).toContainEqual({ participantId: 'alice', netCents: 6000 });
    expect(balances).toContainEqual({ participantId: 'bob', netCents: -3000 });
    expect(balances).toContainEqual({ participantId: 'charlie', netCents: -3000 });
  });

  it('sum of all balances equals zero', () => {
    const expenses: Expense[] = [
      { id: 'e1', payerParticipantId: 'alice', amountCents: 12300, currency: 'EUR' },
      { id: 'e2', payerParticipantId: 'bob', amountCents: 5700, currency: 'EUR' },
    ];
    const splits: ExpenseSplit[] = [
      { expenseId: 'e1', participantId: 'alice', shareCents: 4100 },
      { expenseId: 'e1', participantId: 'bob', shareCents: 4100 },
      { expenseId: 'e1', participantId: 'charlie', shareCents: 4100 },
      { expenseId: 'e2', participantId: 'alice', shareCents: 1900 },
      { expenseId: 'e2', participantId: 'bob', shareCents: 1900 },
      { expenseId: 'e2', participantId: 'charlie', shareCents: 1900 },
    ];
    const balances = computeBalances(expenses, splits);
    const sum = balances.reduce((acc, b) => acc + b.netCents, 0);
    expect(sum).toBe(0);
  });
});

describe('simplifyDebts', () => {
  it('returns empty for already balanced participants', () => {
    const balances: Balance[] = [
      { participantId: 'alice', netCents: 0 },
      { participantId: 'bob', netCents: 0 },
    ];
    expect(simplifyDebts(balances)).toEqual([]);
  });

  it('simplifies simple two-person debt', () => {
    const balances: Balance[] = [
      { participantId: 'alice', netCents: 5000 },
      { participantId: 'bob', netCents: -5000 },
    ];
    const settlements = simplifyDebts(balances);
    expect(settlements).toEqual([
      { fromParticipantId: 'bob', toParticipantId: 'alice', amountCents: 5000 },
    ]);
  });

  it('simplifies three-person case to minimal transfers', () => {
    const balances: Balance[] = [
      { participantId: 'alice', netCents: 6000 },
      { participantId: 'bob', netCents: -3000 },
      { participantId: 'charlie', netCents: -3000 },
    ];
    const settlements = simplifyDebts(balances);
    // Expect two transfers (both bob and charlie pay alice)
    expect(settlements).toHaveLength(2);
    const total = settlements.reduce((sum, s) => sum + s.amountCents, 0);
    expect(total).toBe(6000);
  });

  it('ignores zero-balance participants', () => {
    const balances: Balance[] = [
      { participantId: 'alice', netCents: 2000 },
      { participantId: 'bob', netCents: -2000 },
      { participantId: 'charlie', netCents: 0 },
    ];
    const settlements = simplifyDebts(balances);
    expect(settlements).toEqual([
      { fromParticipantId: 'bob', toParticipantId: 'alice', amountCents: 2000 },
    ]);
  });

  it('sum of all settlements equals sum of positive balances', () => {
    const balances: Balance[] = [
      { participantId: 'alice', netCents: 3000 },
      { participantId: 'bob', netCents: 2000 },
      { participantId: 'charlie', netCents: -5000 },
    ];
    const settlements = simplifyDebts(balances);
    const settlementSum = settlements.reduce((sum, s) => sum + s.amountCents, 0);
    expect(settlementSum).toBe(5000);
  });
});
