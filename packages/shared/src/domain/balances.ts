import type { Expense, ExpenseSplit, Balance, Settlement } from '../types';

/**
 * Compute net balance for each participant.
 *
 * ASSUMPTION: For each expense, the sum of all split shareCents must equal the expense amountCents.
 * This function does not validate this constraint.
 *
 * Net balance = (sum of amountCents where participantId is payer)
 *             - (sum of shareCents where participantId is in splits)
 *
 * Positive net means the participant is owed money; negative means they owe.
 * The sum of all net balances across all participants must equal zero.
 */
export function computeBalances(
  expenses: Expense[],
  splits: ExpenseSplit[],
): Balance[] {
  const balances: Record<string, number> = {};

  // Sum expenses paid by each participant
  expenses.forEach((exp) => {
    if (!balances[exp.payerParticipantId]) {
      balances[exp.payerParticipantId] = 0;
    }
    balances[exp.payerParticipantId] += exp.amountCents;
  });

  // Subtract shares owed by each participant
  splits.forEach((split) => {
    if (!balances[split.participantId]) {
      balances[split.participantId] = 0;
    }
    balances[split.participantId] -= split.shareCents;
  });

  return Object.entries(balances).map(([participantId, netCents]) => ({
    participantId,
    netCents,
  }));
}

/**
 * Simplify debts using a greedy min-cash-flow algorithm.
 *
 * This greedy approach finds minimal transfers by repeatedly matching the participant
 * with the largest negative balance (most in debt) with the participant with the largest
 * positive balance (most owed), transferring the smaller absolute value until one is settled.
 *
 * This produces a minimal set of settlements (number of transfers is at most n-1 where n
 * is the number of participants with non-zero balance).
 *
 * Returns an empty array if all balances are zero or close to zero.
 */
export function simplifyDebts(balances: Balance[]): Settlement[] {
  // Work with a mutable copy, ignoring zero balances
  const working = balances
    .filter((b) => b.netCents !== 0)
    .map((b) => ({ ...b }));

  const settlements: Settlement[] = [];

  while (working.length > 0) {
    // Find the debtor with the most negative balance
    let debtorIndex = 0;
    for (let i = 1; i < working.length; i++) {
      if (working[i].netCents < working[debtorIndex].netCents) {
        debtorIndex = i;
      }
    }
    const debtor = working[debtorIndex];

    // Find the creditor with the most positive balance
    let creditorIndex = 0;
    for (let i = 1; i < working.length; i++) {
      if (working[i].netCents > working[creditorIndex].netCents) {
        creditorIndex = i;
      }
    }
    const creditor = working[creditorIndex];

    if (creditor.netCents <= 0) {
      // No creditors left, we're done
      break;
    }

    // Transfer the minimum of their absolute values
    const amount = Math.min(creditor.netCents, -debtor.netCents);
    settlements.push({
      fromParticipantId: debtor.participantId,
      toParticipantId: creditor.participantId,
      amountCents: amount,
    });

    debtor.netCents += amount;
    creditor.netCents -= amount;

    // Remove settled participants
    if (debtor.netCents === 0) {
      working.splice(debtorIndex, 1);
    }
    if (creditor.netCents === 0) {
      // Adjust index if debtor was removed before creditor
      const adjustedCreditorIndex = debtorIndex < creditorIndex ? creditorIndex - 1 : creditorIndex;
      working.splice(adjustedCreditorIndex, 1);
    }
  }

  return settlements;
}
