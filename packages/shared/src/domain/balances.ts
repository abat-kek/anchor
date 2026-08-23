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
    if (!(exp.payerParticipantId in balances)) {
      balances[exp.payerParticipantId] = 0;
    }
    const bal = balances[exp.payerParticipantId];
    if (bal !== undefined) {
      balances[exp.payerParticipantId] = bal + exp.amountCents;
    }
  });

  // Subtract shares owed by each participant
  splits.forEach((split) => {
    if (!(split.participantId in balances)) {
      balances[split.participantId] = 0;
    }
    const bal = balances[split.participantId];
    if (bal !== undefined) {
      balances[split.participantId] = bal - split.shareCents;
    }
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
    let debtor = working[0];
    if (!debtor) break;

    for (let i = 1; i < working.length; i++) {
      const current = working[i];
      if (current && current.netCents < debtor.netCents) {
        debtorIndex = i;
        debtor = current;
      }
    }

    // Find the creditor with the most positive balance
    let creditorIndex = 0;
    let creditor = working[0];
    if (!creditor) break;

    for (let i = 1; i < working.length; i++) {
      const current = working[i];
      if (current && current.netCents > creditor.netCents) {
        creditorIndex = i;
        creditor = current;
      }
    }

    if (!creditor || creditor.netCents <= 0) {
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
