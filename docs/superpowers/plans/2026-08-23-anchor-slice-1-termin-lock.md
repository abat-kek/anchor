# Scheibe 1 — Termin-Lock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Freund öffnet einen Link, tritt einem Trip bei, gibt Verfügbarkeit je Terminfenster an und sagt verbindlich zu; ein sozial sichtbarer Live-Zähler zeigt „X/Y dabei"; bei Deadline lockt das System automatisch den best-besuchten Termin.

**Architecture:** Die Entscheidungs-Logik (Zähler, Tallies, best-besuchter Termin, Lock-Entscheidung) ist **pure & DB-frei** in `packages/shared/src/domain` und wird strikt per TDD gebaut. Datenzugriff für nicht-authentifizierte Link-Gäste läuft über capability-basierte Postgres-RPCs (security definer, participant-UUID = Zugangs-Token). Auto-Lock läuft server-seitig als Edge Function per pg_cron und nutzt dieselbe `resolveLock`-Funktion (eine Quelle der Wahrheit via Deno import-map).

**Tech Stack:** TypeScript/Vitest (Domain), Supabase (Postgres/RLS/RPC/Realtime/Edge Functions/pg_cron), Next.js (Link-first Web), Expo (Creator-App), Playwright (E2E).

**Voraussetzung:** Scheibe 0 abgeschlossen (Monorepo, `@anchor/shared`, Supabase lokal, Clients verbunden). Typ-Kontrakte: [Roadmap §5](2026-08-23-anchor-v1-roadmap.md).

---

## Datei-Struktur dieser Scheibe

- Create: `packages/shared/src/types.ts` (Kontrakte aus Roadmap §5)
- Create/Test: `packages/shared/src/domain/commitment.ts` + `packages/shared/test/commitment.test.ts`
- Create/Test: `packages/shared/src/domain/lock.ts` + `packages/shared/test/lock.test.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `supabase/migrations/0002_trip_scheduling.sql`
- Create: `supabase/migrations/0003_guest_rpcs.sql`
- Create: `supabase/migrations/0004_autolock_schedule.sql`
- Create: `supabase/functions/auto-lock/index.ts`, `supabase/functions/import_map.json`
- Create: `apps/web/app/join/[token]/page.tsx`, `apps/web/app/trip/[id]/page.tsx`, `apps/web/src/lib/participant-store.ts`
- Create: `apps/mobile/src/features/trip/CreateTripScreen.tsx`, `apps/mobile/app/create.tsx`, `apps/mobile/app/trip/[id].tsx`
- Create: `apps/web/e2e/termin-lock.spec.ts`, `apps/web/playwright.config.ts`

---

### Task 1: Domain — `commitment.ts` (Zähler, Tallies, best-besuchter Termin)

**Files:**
- Create: `packages/shared/src/types.ts`
- Test: `packages/shared/test/commitment.test.ts`
- Create: `packages/shared/src/domain/commitment.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Typ-Kontrakte schreiben**

Create `packages/shared/src/types.ts` (exakt aus Roadmap §5):

```typescript
export type TripStatus =
  | 'draft' | 'collecting' | 'locked' | 'accommodation' | 'active' | 'done';

export type Availability = 'yes' | 'maybe' | 'no';

export interface DateOption {
  id: string;
  tripId: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
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
  now: string;
  deadline: string;
  options: DateOption[];
  tallies: DateTally[];
  totalCommitted: number;
}
```

- [ ] **Step 2: Failing test für `countCommitted`**

Create `packages/shared/test/commitment.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { countCommitted, computeTallies, selectBestOption } from '../src/domain/commitment';
import type { DateOption, DateAvailability } from '../src/types';

describe('countCommitted', () => {
  it('returns 0 for empty list', () => {
    expect(countCommitted([])).toBe(0);
  });
  it('counts only committed participants', () => {
    expect(
      countCommitted([{ isCommitted: true }, { isCommitted: false }, { isCommitted: true }]),
    ).toBe(2);
  });
});
```

- [ ] **Step 3: Test laufen (muss fehlschlagen)**

```bash
pnpm --filter @anchor/shared test
```

Expected: FAIL — Modul `../src/domain/commitment` nicht gefunden.

- [ ] **Step 4: Minimale Implementierung `countCommitted`**

Create `packages/shared/src/domain/commitment.ts`:

```typescript
import type { DateOption, DateAvailability, DateTally } from '../types';

export function countCommitted(participants: { isCommitted: boolean }[]): number {
  return participants.filter((p) => p.isCommitted).length;
}
```

- [ ] **Step 5: Test laufen (grün für countCommitted)**

```bash
pnpm --filter @anchor/shared test
```

Expected: `countCommitted` grün; `computeTallies`/`selectBestOption` noch undefined (nächster Zyklus).

- [ ] **Step 6: Failing tests für `computeTallies` ergänzen**

Append to `packages/shared/test/commitment.test.ts`:

```typescript
describe('computeTallies', () => {
  const options: DateOption[] = [
    { id: 'o1', tripId: 't', startDate: '2026-03-14', endDate: '2026-03-16' },
    { id: 'o2', tripId: 't', startDate: '2026-03-21', endDate: '2026-03-23' },
  ];
  const committed = ['p1', 'p2'];

  it('counts availabilities only for committed participants', () => {
    const avail: DateAvailability[] = [
      { dateOptionId: 'o1', participantId: 'p1', availability: 'yes' },
      { dateOptionId: 'o1', participantId: 'p2', availability: 'maybe' },
      { dateOptionId: 'o1', participantId: 'p3', availability: 'yes' }, // p3 nicht committed → ignoriert
      { dateOptionId: 'o2', participantId: 'p1', availability: 'no' },
    ];
    const tallies = computeTallies(options, avail, committed);
    expect(tallies).toEqual([
      { optionId: 'o1', yes: 1, maybe: 1, no: 0 },
      { optionId: 'o2', yes: 0, maybe: 0, no: 1 },
    ]);
  });

  it('returns zero tallies for options without availabilities', () => {
    expect(computeTallies(options, [], committed)).toEqual([
      { optionId: 'o1', yes: 0, maybe: 0, no: 0 },
      { optionId: 'o2', yes: 0, maybe: 0, no: 0 },
    ]);
  });
});
```

- [ ] **Step 7: Test laufen (computeTallies muss fehlschlagen)**

```bash
pnpm --filter @anchor/shared test
```

Expected: FAIL — `computeTallies is not a function`.

- [ ] **Step 8: Implementierung `computeTallies`**

Append to `packages/shared/src/domain/commitment.ts`:

```typescript
export function computeTallies(
  options: DateOption[],
  availabilities: DateAvailability[],
  committedParticipantIds: string[],
): DateTally[] {
  const committed = new Set(committedParticipantIds);
  return options.map((option) => {
    const relevant = availabilities.filter(
      (a) => a.dateOptionId === option.id && committed.has(a.participantId),
    );
    return {
      optionId: option.id,
      yes: relevant.filter((a) => a.availability === 'yes').length,
      maybe: relevant.filter((a) => a.availability === 'maybe').length,
      no: relevant.filter((a) => a.availability === 'no').length,
    };
  });
}
```

- [ ] **Step 9: Test laufen (grün)**

```bash
pnpm --filter @anchor/shared test
```

Expected: PASS.

- [ ] **Step 10: Failing tests für `selectBestOption` ergänzen**

Append to `packages/shared/test/commitment.test.ts`:

```typescript
describe('selectBestOption', () => {
  it('returns null when no option has yes or maybe', () => {
    expect(selectBestOption([{ optionId: 'o1', yes: 0, maybe: 0, no: 3 }])).toBeNull();
  });
  it('picks the option with most yes', () => {
    expect(
      selectBestOption([
        { optionId: 'o1', yes: 2, maybe: 1, no: 0 },
        { optionId: 'o2', yes: 3, maybe: 0, no: 0 },
      ]),
    ).toBe('o2');
  });
  it('breaks yes-ties by most maybe', () => {
    expect(
      selectBestOption([
        { optionId: 'o1', yes: 2, maybe: 0, no: 0 },
        { optionId: 'o2', yes: 2, maybe: 2, no: 0 },
      ]),
    ).toBe('o2');
  });
  it('breaks full ties by first (caller sorts by date)', () => {
    expect(
      selectBestOption([
        { optionId: 'o1', yes: 2, maybe: 1, no: 0 },
        { optionId: 'o2', yes: 2, maybe: 1, no: 0 },
      ]),
    ).toBe('o1');
  });
});
```

- [ ] **Step 11: Test laufen (muss fehlschlagen)**

```bash
pnpm --filter @anchor/shared test
```

Expected: FAIL — `selectBestOption is not a function`.

- [ ] **Step 12: Implementierung `selectBestOption`**

Append to `packages/shared/src/domain/commitment.ts`:

```typescript
export function selectBestOption(tallies: DateTally[]): string | null {
  let best: DateTally | null = null;
  for (const t of tallies) {
    if (t.yes === 0 && t.maybe === 0) continue;
    if (
      best === null ||
      t.yes > best.yes ||
      (t.yes === best.yes && t.maybe > best.maybe)
    ) {
      best = t;
    }
  }
  return best ? best.optionId : null;
}
```

- [ ] **Step 13: Export ergänzen & Test laufen (grün)**

Modify `packages/shared/src/index.ts` — ergänzen:

```typescript
export * from './types';
export { countCommitted, computeTallies, selectBestOption } from './domain/commitment';
```

```bash
pnpm --filter @anchor/shared test
```

Expected: PASS (alle commitment-Tests).

- [ ] **Step 14: Committen**

```bash
git add packages/shared
git commit -m "feat(shared): commitment domain — counting, tallies, best-attended date"
```

---

### Task 2: Domain — `lock.ts` (Lock-Entscheidung)

**Files:**
- Test: `packages/shared/test/lock.test.ts`
- Create: `packages/shared/src/domain/lock.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Failing tests schreiben**

Create `packages/shared/test/lock.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { resolveLock } from '../src/domain/lock';
import type { DateOption, DateTally, ResolveLockInput } from '../src/types';

const options: DateOption[] = [
  { id: 'o1', tripId: 't', startDate: '2026-03-14', endDate: '2026-03-16' },
  { id: 'o2', tripId: 't', startDate: '2026-03-21', endDate: '2026-03-23' },
];

function input(over: Partial<ResolveLockInput>): ResolveLockInput {
  return {
    now: '2026-03-01T12:00:00Z',
    deadline: '2026-03-10T12:00:00Z',
    options,
    tallies: [
      { optionId: 'o1', yes: 1, maybe: 0, no: 0 },
      { optionId: 'o2', yes: 0, maybe: 0, no: 0 },
    ],
    totalCommitted: 3,
    ...over,
  };
}

describe('resolveLock', () => {
  it('waits with no_options when there are none', () => {
    expect(resolveLock(input({ options: [], tallies: [] }))).toEqual({
      action: 'wait',
      reason: 'no_options',
    });
  });

  it('waits before deadline when nobody is unanimously available', () => {
    expect(resolveLock(input({}))).toEqual({ action: 'wait', reason: 'before_deadline' });
  });

  it('suggests early lock when an option has everyone committed as yes', () => {
    expect(
      resolveLock(
        input({
          totalCommitted: 3,
          tallies: [
            { optionId: 'o1', yes: 3, maybe: 0, no: 0 },
            { optionId: 'o2', yes: 1, maybe: 0, no: 0 },
          ],
        }),
      ),
    ).toEqual({ action: 'suggest_early_lock', optionId: 'o1' });
  });

  it('locks the best-attended option after the deadline', () => {
    expect(
      resolveLock(
        input({
          now: '2026-03-11T12:00:00Z',
          tallies: [
            { optionId: 'o1', yes: 1, maybe: 0, no: 0 },
            { optionId: 'o2', yes: 2, maybe: 0, no: 0 },
          ],
        }),
      ),
    ).toEqual({ action: 'lock', optionId: 'o2' });
  });

  it('waits with no_commitments when deadline passed but no viable date', () => {
    expect(
      resolveLock(
        input({
          now: '2026-03-11T12:00:00Z',
          totalCommitted: 0,
          tallies: [
            { optionId: 'o1', yes: 0, maybe: 0, no: 0 },
            { optionId: 'o2', yes: 0, maybe: 0, no: 0 },
          ],
        }),
      ),
    ).toEqual({ action: 'wait', reason: 'no_commitments' });
  });
});
```

- [ ] **Step 2: Test laufen (muss fehlschlagen)**

```bash
pnpm --filter @anchor/shared test
```

Expected: FAIL — Modul `../src/domain/lock` nicht gefunden.

- [ ] **Step 3: Implementierung `resolveLock`**

Create `packages/shared/src/domain/lock.ts`:

```typescript
import type { LockDecision, ResolveLockInput } from '../types';
import { selectBestOption } from './commitment';

export function resolveLock(inputData: ResolveLockInput): LockDecision {
  const { now, deadline, options, tallies, totalCommitted } = inputData;

  if (options.length === 0) return { action: 'wait', reason: 'no_options' };

  const deadlinePassed = new Date(now).getTime() >= new Date(deadline).getTime();
  const best = selectBestOption(tallies);

  if (deadlinePassed) {
    if (best === null) return { action: 'wait', reason: 'no_commitments' };
    return { action: 'lock', optionId: best };
  }

  if (totalCommitted > 0) {
    const unanimous = tallies.find((t) => t.yes === totalCommitted);
    if (unanimous) return { action: 'suggest_early_lock', optionId: unanimous.optionId };
  }

  return { action: 'wait', reason: 'before_deadline' };
}
```

- [ ] **Step 4: Export ergänzen & Test laufen (grün)**

Modify `packages/shared/src/index.ts` — ergänzen:

```typescript
export { resolveLock } from './domain/lock';
```

```bash
pnpm --filter @anchor/shared test
```

Expected: PASS (commitment + lock).

- [ ] **Step 5: Committen**

```bash
git add packages/shared
git commit -m "feat(shared): lock decision — auto-lock at deadline, early-lock suggestion"
```

---

### Task 3: DB-Migration — Trips, Teilnehmer, Terminfenster, Verfügbarkeiten

**Files:**
- Create: `supabase/migrations/0002_trip_scheduling.sql`

- [ ] **Step 1: Migration schreiben**

Create `supabase/migrations/0002_trip_scheduling.sql`:

```sql
-- Link-Gäste (nicht-authentifizierte Teilnehmer)
create table public.link_guests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  display_name text not null,
  email text,
  converted_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.link_guests enable row level security;

-- Trips
create type public.trip_status as enum
  ('draft', 'collecting', 'locked', 'accommodation', 'active', 'done');

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  status public.trip_status not null default 'collecting',
  destination text,
  deadline timestamptz not null,
  share_token text not null unique default encode(gen_random_bytes(9), 'base64'),
  locked_date_option_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.trips enable row level security;

-- Teilnehmer eines Trips (App-User ODER Link-Gast)
create table public.trip_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id),
  link_guest_id uuid references public.link_guests(id) on delete cascade,
  display_name text not null,
  is_committed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint participant_is_user_or_guest
    check (num_nonnulls(user_id, link_guest_id) = 1)
);
alter table public.trip_participants enable row level security;

-- Terminfenster
create table public.trip_date_options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  start_date date not null,
  end_date date not null
);
alter table public.trip_date_options enable row level security;

-- Verfügbarkeit je Teilnehmer je Terminfenster
create type public.availability as enum ('yes', 'maybe', 'no');

create table public.date_availabilities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  date_option_id uuid not null references public.trip_date_options(id) on delete cascade,
  participant_id uuid not null references public.trip_participants(id) on delete cascade,
  availability public.availability not null,
  unique (date_option_id, participant_id)
);
alter table public.date_availabilities enable row level security;

-- FK für locked_date_option nachziehen
alter table public.trips
  add constraint trips_locked_option_fk
  foreign key (locked_date_option_id) references public.trip_date_options(id);

-- v1-Lesepolicies: Trip-Kontext ist über share_token/participant-UUID zugänglich.
-- Für den Link-first-Flow lesen wir serverseitig; einfache Read-Policies:
create policy "trips readable" on public.trips for select using (true);
create policy "date options readable" on public.trip_date_options for select using (true);
create policy "participants readable" on public.trip_participants for select using (true);
create policy "availabilities readable" on public.date_availabilities for select using (true);
create policy "link guests readable" on public.link_guests for select using (true);

-- Schreiben läuft ausschließlich über RPCs (Task 4), daher keine INSERT/UPDATE-Policies hier.

-- Realtime für Live-Zähler aktivieren
alter publication supabase_realtime add table public.trip_participants;
alter publication supabase_realtime add table public.date_availabilities;
alter publication supabase_realtime add table public.trips;
```

> **Sicherheits-Hinweis (v1):** Read-Policies sind bewusst offen (`using(true)`), weil der
> Link-first-Zugang über nicht-ratebare Tokens/UUIDs läuft. Schreibzugriff geht nur über die
> capability-basierten RPCs in Task 4. In v1.1 auf membership-basierte RLS verschärfen.

- [ ] **Step 2: Migration anwenden**

```bash
supabase db reset
```

Expected: `0001` + `0002` laufen fehlerfrei; alle Tabellen + Enums existieren.

- [ ] **Step 3: DB-Typen neu generieren**

```bash
supabase gen types typescript --local > packages/shared/src/db-types.ts
```

Expected: `db-types.ts` enthält jetzt `trips`, `trip_participants`, `trip_date_options`, `date_availabilities`, `link_guests`.

- [ ] **Step 4: Committen**

```bash
git add supabase/migrations/0002_trip_scheduling.sql packages/shared/src/db-types.ts
git commit -m "feat(db): trip scheduling schema — trips, participants, options, availabilities"
```

---

### Task 4: Guest-RPCs — beitreten, Verfügbarkeit, zusagen, Lock-Status

**Files:**
- Create: `supabase/migrations/0003_guest_rpcs.sql`

- [ ] **Step 1: RPCs schreiben**

Create `supabase/migrations/0003_guest_rpcs.sql`:

```sql
-- Beitreten via Trip-Token: legt Link-Gast + Teilnehmer an, gibt Zugangs-IDs zurück.
create function public.join_trip_via_token(p_token text, p_display_name text)
returns table(trip_id uuid, participant_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  v_trip public.trips;
  v_guest_id uuid;
  v_participant_id uuid;
begin
  select * into v_trip from public.trips where share_token = p_token;
  if not found then
    raise exception 'invalid_token';
  end if;

  insert into public.link_guests (group_id, display_name)
  values (v_trip.group_id, p_display_name)
  returning id into v_guest_id;

  insert into public.trip_participants (trip_id, link_guest_id, display_name)
  values (v_trip.id, v_guest_id, p_display_name)
  returning id into v_participant_id;

  return query select v_trip.id, v_participant_id;
end;
$$;

-- Verfügbarkeit setzen (Upsert). participant_id = Zugangs-Capability.
create function public.set_availability(
  p_participant_id uuid,
  p_date_option_id uuid,
  p_availability public.availability
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_trip_id uuid;
begin
  select trip_id into v_trip_id from public.trip_participants where id = p_participant_id;
  if not found then raise exception 'invalid_participant'; end if;

  insert into public.date_availabilities (trip_id, date_option_id, participant_id, availability)
  values (v_trip_id, p_date_option_id, p_participant_id, p_availability)
  on conflict (date_option_id, participant_id)
  do update set availability = excluded.availability;
end;
$$;

-- Verbindlich zusagen / zurückziehen.
create function public.set_commitment(p_participant_id uuid, p_is_committed boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.trip_participants
  set is_committed = p_is_committed
  where id = p_participant_id;
  if not found then raise exception 'invalid_participant'; end if;
end;
$$;

-- Creator lockt manuell einen Termin.
create function public.lock_trip(p_trip_id uuid, p_date_option_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.trips
  set status = 'locked', locked_date_option_id = p_date_option_id
  where id = p_trip_id and status = 'collecting';
  if not found then raise exception 'trip_not_lockable'; end if;
end;
$$;

grant execute on function public.join_trip_via_token(text, text) to anon, authenticated;
grant execute on function public.set_availability(uuid, uuid, public.availability) to anon, authenticated;
grant execute on function public.set_commitment(uuid, boolean) to anon, authenticated;
grant execute on function public.lock_trip(uuid, uuid) to authenticated;
```

- [ ] **Step 2: Migration anwenden**

```bash
supabase db reset
```

Expected: `0003` läuft fehlerfrei.

- [ ] **Step 3: RPC manuell verifizieren (Smoke via psql)**

```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "insert into groups(name) values ('Test-Crew') returning id;"
```

Dann in psql einen Trip anlegen und `join_trip_via_token` aufrufen:

```sql
insert into trips(group_id, title, deadline)
  select id, 'Testtrip', now() + interval '7 days' from groups limit 1
  returning share_token;
-- share_token kopieren, dann:
select * from join_trip_via_token('<token>', 'Kevin');
```

Expected: `join_trip_via_token` liefert `trip_id` + `participant_id`; `trip_participants` hat eine Zeile.

- [ ] **Step 4: Typen neu generieren & committen**

```bash
supabase gen types typescript --local > packages/shared/src/db-types.ts
git add supabase/migrations/0003_guest_rpcs.sql packages/shared/src/db-types.ts
git commit -m "feat(db): capability-based guest RPCs — join, availability, commit, lock"
```

---

### Task 5: Auto-Lock Edge Function + pg_cron-Zeitplan

**Files:**
- Create: `supabase/functions/import_map.json`
- Create: `supabase/functions/auto-lock/index.ts`
- Create: `supabase/migrations/0004_autolock_schedule.sql`

- [ ] **Step 1: Import-Map (eine Quelle der Wahrheit für `resolveLock`)**

Create `supabase/functions/import_map.json`:

```json
{
  "imports": {
    "@anchor/domain/": "../../packages/shared/src/domain/",
    "@anchor/types": "../../packages/shared/src/types.ts"
  }
}
```

- [ ] **Step 2: Edge Function schreiben**

Create `supabase/functions/auto-lock/index.ts`:

```typescript
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { resolveLock } from '@anchor/domain/lock.ts';
import { computeTallies, countCommitted } from '@anchor/domain/commitment.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async () => {
  const nowIso = new Date().toISOString();

  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, deadline')
    .eq('status', 'collecting')
    .lte('deadline', nowIso);
  if (error) return new Response(error.message, { status: 500 });

  let locked = 0;
  for (const trip of trips ?? []) {
    const [{ data: options }, { data: participants }, { data: avail }] = await Promise.all([
      supabase.from('trip_date_options').select('id, trip_id, start_date, end_date')
        .eq('trip_id', trip.id).order('start_date', { ascending: true }),
      supabase.from('trip_participants').select('id, is_committed').eq('trip_id', trip.id),
      supabase.from('date_availabilities').select('date_option_id, participant_id, availability')
        .eq('trip_id', trip.id),
    ]);

    const committedIds = (participants ?? []).filter((p) => p.is_committed).map((p) => p.id);
    const mappedOptions = (options ?? []).map((o) => ({
      id: o.id, tripId: o.trip_id, startDate: o.start_date, endDate: o.end_date,
    }));
    const mappedAvail = (avail ?? []).map((a) => ({
      dateOptionId: a.date_option_id, participantId: a.participant_id, availability: a.availability,
    }));

    const tallies = computeTallies(mappedOptions, mappedAvail, committedIds);
    const decision = resolveLock({
      now: nowIso,
      deadline: trip.deadline,
      options: mappedOptions,
      tallies,
      totalCommitted: countCommitted(participants ?? []),
    });

    if (decision.action === 'lock') {
      await supabase.from('trips')
        .update({ status: 'locked', locked_date_option_id: decision.optionId })
        .eq('id', trip.id);
      locked++;
    }
  }

  return new Response(JSON.stringify({ checked: trips?.length ?? 0, locked }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

- [ ] **Step 3: Function lokal serven & manuell testen**

```bash
supabase functions serve auto-lock --import-map supabase/functions/import_map.json
```

In einem zweiten Terminal (Trip mit Deadline in der Vergangenheit vorher via psql anlegen + Teilnehmer/Verfügbarkeit setzen), dann:

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/auto-lock \
  -H "Authorization: Bearer <service-role-key>"
```

Expected: `{"checked":1,"locked":1}` und der Trip ist in der DB `status='locked'` mit gesetztem `locked_date_option_id`.

- [ ] **Step 4: pg_cron-Zeitplan schreiben**

Create `supabase/migrations/0004_autolock_schedule.sql`:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Alle 15 Minuten Auto-Lock-Function anstoßen.
select cron.schedule(
  'anchor-auto-lock',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := current_setting('app.functions_url') || '/auto-lock',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    )
  );
  $$
);
```

> **Betriebshinweis:** `app.functions_url` und `app.service_role_key` werden pro Umgebung
> gesetzt (`alter database ... set app.functions_url = '...';`). Lokal kann der Cron-Aufruf
> entfallen und die Function manuell/über einen Test angestoßen werden.

- [ ] **Step 5: Committen**

```bash
git add supabase/functions supabase/migrations/0004_autolock_schedule.sql
git commit -m "feat(edge): auto-lock function reusing shared resolveLock + pg_cron schedule"
```

---

### Task 6: Web — Link-first Beitritts-Seite `/join/[token]`

**Files:**
- Create: `apps/web/src/lib/participant-store.ts`
- Create: `apps/web/app/join/[token]/page.tsx`

- [ ] **Step 1: Teilnehmer-Store (participant-UUID im localStorage als Capability)**

Create `apps/web/src/lib/participant-store.ts`:

```typescript
'use client';

const key = (tripId: string) => `anchor:participant:${tripId}`;

export function saveParticipant(tripId: string, participantId: string): void {
  localStorage.setItem(key(tripId), participantId);
}

export function getParticipant(tripId: string): string | null {
  return localStorage.getItem(key(tripId));
}
```

- [ ] **Step 2: Beitritts-Seite schreiben**

Create `apps/web/app/join/[token]/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { saveParticipant } from '@/lib/participant-store';

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc('join_trip_via_token', {
      p_token: token,
      p_display_name: name.trim(),
    });
    setBusy(false);
    if (error || !data?.[0]) {
      setError('Beitritt fehlgeschlagen — Link ungültig?');
      return;
    }
    const { trip_id, participant_id } = data[0];
    saveParticipant(trip_id, participant_id);
    router.push(`/trip/${trip_id}`);
  }

  return (
    <main style={{ padding: 24, maxWidth: 420, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1>Du bist eingeladen 🎉</h1>
      <p>Sag kurz, wie du heißt — dann rein in den Trip.</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Dein Name"
        style={{ width: '100%', padding: 12, fontSize: 16, marginBottom: 12 }}
      />
      <button onClick={join} disabled={!name.trim() || busy} style={{ padding: 12, width: '100%' }}>
        {busy ? '…' : 'Beitreten'}
      </button>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  );
}
```

> **Design-Hinweis:** UI ist bewusst funktional-minimal (Ziel dieser Scheibe = Flow lauffähig).
> Visuelles Design (Anti-Template, siehe design-quality-Regeln) ist ein eigener Pass nach v1-Funktion.

- [ ] **Step 3: Manuell prüfen**

Voraussetzung: ein Trip existiert (via psql / Mobile Task 8). `supabase start` + `pnpm --filter web dev`, dann `http://localhost:3000/join/<token>` öffnen.

Expected: Name eingeben → „Beitreten" → Weiterleitung nach `/trip/<id>`; neue Zeile in `trip_participants`.

- [ ] **Step 4: Committen**

```bash
git add apps/web/app/join apps/web/src/lib/participant-store.ts
git commit -m "feat(web): link-first join page via trip token"
```

---

### Task 7: Web — Trip-Seite `/trip/[id]` mit Verfügbarkeit, Zusage & Live-Zähler

**Files:**
- Create: `apps/web/app/trip/[id]/page.tsx`

- [ ] **Step 1: Trip-Seite schreiben**

Create `apps/web/app/trip/[id]/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getParticipant } from '@/lib/participant-store';
import { countCommitted, type Availability } from '@anchor/shared';

interface OptionRow { id: string; start_date: string; end_date: string; }

export default function TripPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [options, setOptions] = useState<OptionRow[]>([]);
  const [committedCount, setCommittedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [status, setStatus] = useState<string>('collecting');
  const [myAvail, setMyAvail] = useState<Record<string, Availability>>({});
  const [amCommitted, setAmCommitted] = useState(false);

  const refresh = useCallback(async () => {
    const [{ data: opts }, { data: parts }, { data: trip }] = await Promise.all([
      supabase.from('trip_date_options').select('id, start_date, end_date')
        .eq('trip_id', tripId).order('start_date'),
      supabase.from('trip_participants').select('id, is_committed').eq('trip_id', tripId),
      supabase.from('trips').select('status').eq('id', tripId).single(),
    ]);
    setOptions(opts ?? []);
    setTotalCount((parts ?? []).length);
    setCommittedCount(countCommitted((parts ?? []).map((p) => ({ isCommitted: p.is_committed }))));
    if (trip) setStatus(trip.status);
    const me = (parts ?? []).find((p) => p.id === participantId);
    if (me) setAmCommitted(me.is_committed);
  }, [tripId, participantId]);

  useEffect(() => {
    setParticipantId(getParticipant(tripId));
  }, [tripId]);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`trip:${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_participants' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [tripId, refresh]);

  async function setAvailability(optionId: string, availability: Availability) {
    if (!participantId) return;
    setMyAvail((prev) => ({ ...prev, [optionId]: availability }));
    await supabase.rpc('set_availability', {
      p_participant_id: participantId,
      p_date_option_id: optionId,
      p_availability: availability,
    });
  }

  async function toggleCommit() {
    if (!participantId) return;
    const next = !amCommitted;
    setAmCommitted(next);
    await supabase.rpc('set_commitment', { p_participant_id: participantId, p_is_committed: next });
    await refresh();
  }

  return (
    <main style={{ padding: 24, maxWidth: 480, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1>Der Trip</h1>
      {status === 'locked' ? (
        <p style={{ fontWeight: 700 }}>🎉 Termin steht fest!</p>
      ) : (
        <p style={{ fontSize: 20, fontWeight: 700 }}>{committedCount}/{totalCount} dabei</p>
      )}

      <h2>Wann kannst du?</h2>
      {options.map((o) => (
        <div key={o.id} style={{ marginBottom: 12 }}>
          <div>{o.start_date} – {o.end_date}</div>
          {(['yes', 'maybe', 'no'] as Availability[]).map((a) => (
            <button
              key={a}
              onClick={() => setAvailability(o.id, a)}
              style={{ marginRight: 8, padding: 8, fontWeight: myAvail[o.id] === a ? 700 : 400 }}
            >
              {a === 'yes' ? '✅ Ja' : a === 'maybe' ? '🤔 Vielleicht' : '❌ Nein'}
            </button>
          ))}
        </div>
      ))}

      {status !== 'locked' && (
        <button onClick={toggleCommit} style={{ padding: 12, width: '100%', marginTop: 16 }}>
          {amCommitted ? 'Zusage zurückziehen' : 'Ich bin dabei 🙌'}
        </button>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Manuell prüfen (Live-Zähler)**

Zwei Browser-Fenster auf `/trip/<id>` öffnen (eins als beigetretener Gast). Im einen „Ich bin dabei" drücken.

Expected: Der Zähler „X/Y dabei" aktualisiert sich in **beiden** Fenstern live (Realtime).

- [ ] **Step 3: Committen**

```bash
git add apps/web/app/trip
git commit -m "feat(web): trip page — availability, commitment, live counter via realtime"
```

---

### Task 8: Mobile — Trip anlegen & Status ansehen

**Files:**
- Create: `apps/mobile/src/features/trip/CreateTripScreen.tsx`
- Create: `apps/mobile/app/create.tsx`
- Create: `apps/mobile/app/trip/[id].tsx`

- [ ] **Step 1: Create-Trip-Screen (Gruppe + Trip + 2 Terminfenster + Deadline)**

Create `apps/mobile/src/features/trip/CreateTripScreen.tsx`:

```tsx
import { useState } from 'react';
import { Alert, Button, Share, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';

export function CreateTripScreen() {
  const [title, setTitle] = useState('');
  const [shareToken, setShareToken] = useState<string | null>(null);

  async function createTrip() {
    // Minimal: Gruppe anlegen, Trip mit Deadline in 7 Tagen, zwei Terminfenster.
    const { data: group, error: gErr } = await supabase
      .from('groups').insert({ name: `${title}-Crew` }).select('id').single();
    if (gErr || !group) { Alert.alert('Fehler', gErr?.message ?? 'Gruppe'); return; }

    const deadline = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    const { data: trip, error: tErr } = await supabase
      .from('trips').insert({ group_id: group.id, title, deadline }).select('id, share_token').single();
    if (tErr || !trip) { Alert.alert('Fehler', tErr?.message ?? 'Trip'); return; }

    await supabase.from('trip_date_options').insert([
      { trip_id: trip.id, start_date: '2026-03-14', end_date: '2026-03-16' },
      { trip_id: trip.id, start_date: '2026-03-21', end_date: '2026-03-23' },
    ]);

    setShareToken(trip.share_token);
  }

  async function shareLink() {
    if (!shareToken) return;
    const url = `https://anchor.app/join/${encodeURIComponent(shareToken)}`;
    await Share.share({ message: `Bist du dabei? ${url}` });
  }

  return (
    <View style={{ flex: 1, padding: 24, gap: 12, justifyContent: 'center' }}>
      <Text style={{ fontSize: 22, fontWeight: '700' }}>Neuer Trip</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Trip-Titel (z. B. Malle 2026)"
        style={{ borderWidth: 1, padding: 12, borderRadius: 8 }}
      />
      <Button title="Trip anlegen" onPress={createTrip} disabled={!title.trim()} />
      {shareToken && (
        <>
          <Text>Trip steht! Teile den Link mit deiner Crew:</Text>
          <Button title="Link teilen" onPress={shareLink} />
        </>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Route für Create-Screen**

Create `apps/mobile/app/create.tsx`:

```tsx
import { CreateTripScreen } from '../src/features/trip/CreateTripScreen';
export default CreateTripScreen;
```

- [ ] **Step 3: Trip-Status-Ansicht (Creator sieht Lock-Status)**

Create `apps/mobile/app/trip/[id].tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { countCommitted } from '@anchor/shared';

export default function TripStatus() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [committed, setCommitted] = useState(0);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('collecting');

  async function refresh() {
    const [{ data: parts }, { data: trip }] = await Promise.all([
      supabase.from('trip_participants').select('id, is_committed').eq('trip_id', id),
      supabase.from('trips').select('status').eq('id', id).single(),
    ]);
    setTotal((parts ?? []).length);
    setCommitted(countCommitted((parts ?? []).map((p) => ({ isCommitted: p.is_committed }))));
    if (trip) setStatus(trip.status);
  }

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`trip-mobile:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_participants' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, () => void refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [id]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {status === 'locked'
        ? <Text style={{ fontSize: 22, fontWeight: '700' }}>🎉 Termin steht!</Text>
        : <Text style={{ fontSize: 22, fontWeight: '700' }}>{committed}/{total} dabei</Text>}
    </View>
  );
}
```

- [ ] **Step 4: Manuell prüfen**

`pnpm --filter mobile exec expo start`. Create-Screen: Trip anlegen → „Link teilen" zeigt Join-URL mit Token. Token in Web `/join/<token>` nutzen; Mobile-Status-Screen zeigt Zähler live.

Expected: Trip + zwei Terminfenster in DB; Share-Link enthält gültigen Token; Zähler aktualisiert bei Web-Zusage.

- [ ] **Step 5: Committen**

```bash
git add apps/mobile/src/features/trip apps/mobile/app/create.tsx apps/mobile/app/trip
git commit -m "feat(mobile): create trip + share link + live status view"
```

---

### Task 9: E2E — Termin-Lock End-to-End (Akzeptanz)

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/termin-lock.spec.ts`

- [ ] **Step 1: Playwright installieren & konfigurieren**

```bash
pnpm --filter web add -D @playwright/test
pnpm --filter web exec playwright install chromium
```

Create `apps/web/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
  },
});
```

- [ ] **Step 2: E2E-Test schreiben**

Create `apps/web/e2e/termin-lock.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test('guest joins, commits, and trip auto-locks after deadline', async ({ page, request }) => {
  // Arrange: Trip mit Deadline in der Vergangenheit + Terminfenster.
  const { data: group } = await admin.from('groups').insert({ name: 'E2E-Crew' }).select('id').single();
  const past = new Date(Date.now() - 60_000).toISOString();
  const { data: trip } = await admin
    .from('trips')
    .insert({ group_id: group!.id, title: 'E2E Trip', deadline: past })
    .select('id, share_token').single();
  const { data: opts } = await admin.from('trip_date_options').insert([
    { trip_id: trip!.id, start_date: '2026-03-14', end_date: '2026-03-16' },
    { trip_id: trip!.id, start_date: '2026-03-21', end_date: '2026-03-23' },
  ]).select('id, start_date');

  // Act 1: Gast tritt bei.
  await page.goto(`/join/${encodeURIComponent(trip!.share_token)}`);
  await page.getByPlaceholder('Dein Name').fill('Testgast');
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page).toHaveURL(new RegExp(`/trip/${trip!.id}`));

  // Act 2: Verfügbarkeit für erstes Fenster + Zusage.
  await page.getByRole('button', { name: '✅ Ja' }).first().click();
  await page.getByRole('button', { name: /Ich bin dabei/ }).click();
  await expect(page.getByText('1/1 dabei')).toBeVisible();

  // Act 3: Auto-Lock-Function anstoßen (Deadline liegt in der Vergangenheit).
  const res = await request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/auto-lock`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  expect(res.ok()).toBeTruthy();

  // Assert: Trip ist gelockt auf das gewählte Fenster.
  const { data: locked } = await admin
    .from('trips').select('status, locked_date_option_id').eq('id', trip!.id).single();
  expect(locked!.status).toBe('locked');
  const firstOption = opts!.find((o) => o.start_date === '2026-03-14');
  expect(locked!.locked_date_option_id).toBe(firstOption!.id);

  // UI reflektiert den Lock (Realtime).
  await expect(page.getByText('🎉 Termin steht fest!')).toBeVisible();
});
```

- [ ] **Step 3: Voraussetzungen für den Lauf**

`supabase start` läuft; `auto-lock` wird geserved:

```bash
supabase functions serve auto-lock --import-map supabase/functions/import_map.json
```

`apps/web/.env.local` muss zusätzlich `SUPABASE_SERVICE_ROLE_KEY=<service-role-key>` enthalten.

- [ ] **Step 4: E2E laufen lassen**

```bash
pnpm --filter web exec playwright test
```

Expected: PASS — Gast tritt bei, sagt zu, „1/1 dabei", Auto-Lock lockt das 14.–16.-März-Fenster, UI zeigt „Termin steht fest!".

- [ ] **Step 5: Committen**

```bash
git add apps/web/playwright.config.ts apps/web/e2e
git commit -m "test(web): e2e — join, commit, auto-lock at deadline"
```

---

## Akzeptanzkriterien Scheibe 1

- [ ] `pnpm --filter @anchor/shared test` grün (commitment + lock, alle Fälle inkl. best-besucht & no_commitments).
- [ ] Gast kann via `/join/[token]` beitreten, Verfügbarkeit setzen, zusagen.
- [ ] Live-Zähler „X/Y dabei" aktualisiert sich über Realtime (Web + Mobile).
- [ ] Auto-Lock lockt bei überschrittener Deadline den best-besuchten Termin.
- [ ] Creator kann in der App einen Trip anlegen + Link teilen.
- [ ] Playwright-E2E grün (End-to-End-Akzeptanz).

## Self-Review-Notiz

- **Spec-Abdeckung:** Kickoff/Zusagen-first (Task 6), Termin-Lock mit FOMO-Zähler + Deadline + Auto-Lock (Tasks 5–7), best-besuchter Termin bei „kein Termin für alle" (Task 2 `resolveLock` + `selectBestOption`), Link-Gast-Handling (Task 4 RPCs).
- **Typ-Konsistenz:** `resolveLock`, `computeTallies`, `countCommitted`, `selectBestOption`, `LockDecision`, `Availability` durchgängig aus `@anchor/shared` — identische Signaturen in Domain-Tests, Edge Function und UI.
- **Eine Quelle der Wahrheit:** `resolveLock` wird sowohl in Vitest getestet als auch von der Edge Function importiert (import_map) — keine Logik-Dopplung in SQL.
- **Kein Platzhalter:** alle Dateien mit vollem Inhalt; jeder Domain-Task mit echtem RED→GREEN.
- **Offen für später (bewusst):** membership-basierte RLS-Verschärfung (v1.1), visuelles Design-Pass, Mobile-E2E.
```
