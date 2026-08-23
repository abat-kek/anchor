export type TripStatus =
  | 'draft' | 'collecting' | 'locked' | 'accommodation' | 'active' | 'done';

export type Availability = 'yes' | 'maybe' | 'no';

export interface DateOption {
  id: string;
  tripId: string;
  startDate: string; // ISO date 'YYYY-MM-DD'
  endDate: string;   // ISO date 'YYYY-MM-DD'
}

export interface DateAvailability {
  dateOptionId: string;
  participantId: string;
  availability: Availability;
}

export interface DateTally {
  optionId: string;
  yes: number;
  maybe: number;
  no: number;
}

export type LockDecision =
  | { action: 'lock'; optionId: string }
  | { action: 'suggest_early_lock'; optionId: string }
  | { action: 'wait'; reason: 'before_deadline' | 'no_options' | 'no_commitments' };

export interface ResolveLockInput {
  now: string;              // ISO datetime
  deadline: string;         // ISO datetime
  options: DateOption[];
  tallies: DateTally[];
  totalCommitted: number;   // Anzahl Teilnehmer mit is_committed=true
}

// Kosten (Scheibe 3)
export interface Expense {
  id: string;
  payerParticipantId: string;
  amountCents: number;
  currency: string;
}

export interface ExpenseSplit {
  expenseId: string;
  participantId: string;
  shareCents: number;
}

export interface Balance {
  participantId: string;
  netCents: number; // >0: bekommt Geld, <0: schuldet Geld
}

export interface Settlement {
  fromParticipantId: string;
  toParticipantId: string;
  amountCents: number;
}

// Nudge-Engine
export type NudgeType = 'deadline_approaching' | 'date_locked' | 'accommodation_chosen' | 'trip_ended';

export interface NudgeHistoryEntry {
  type: NudgeType;
  sentAt: string; // ISO datetime
}

export interface NudgeInput {
  type: NudgeType;
  now: string; // ISO datetime
  history: NudgeHistoryEntry[];
  minGapHours: number;
  maxPerWeek: number;
}
