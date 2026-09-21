# Anchor Slice 1b — Eigene Terminvorschläge + Teilnehmerliste Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Behebt zwei konkrete Lücken der bestehenden Termin-Lock-Scheibe (Slice 1): Teilnehmer können eigene Terminfenster vorschlagen statt nur zwischen zwei fest vorgegebenen zu wählen, und alle sehen eine Namensliste der Mitreisenden statt nur eine Zahl.

**Architektur:** Neue RPC `propose_date_option` fügt eine weitere Zeile in die bereits bestehende Tabelle `trip_date_options` ein (kein Schema-Wechsel, nur eine neue Funktion). `get_trip_state` liefert zusätzlich ein `participants`-Array mit Namen + Zusage-Status. Clientseitige Datumsvalidierung wandert als reine, testbare Funktion nach `packages/shared`, damit Web und Mobile sie nicht duplizieren.

**Tech Stack:** Supabase (Postgres, `plpgsql`, RPC via `security definer`), `packages/shared` (TypeScript, Vitest), Next.js App Router (Web), Expo Router (Mobile), Playwright (E2E).

---

## Vorbedingung

Docker fehlt auf dieser Maschine (siehe `BUILD_REPORT.md`), Supabase läuft hier nicht lokal. Die SQL-Migration wird in diesem Plan geschrieben und lokal nur gegen `packages/shared` getestet (reine Logik). Migration + Playwright-E2E laufen erst nach Freigabe gegen CT 113 (siehe letzter Task).

---

### Task 1: Migration — `propose_date_option` RPC + `participants` in `get_trip_state`

**Files:**
- Create: `supabase/migrations/0009_date_proposals_and_participants.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- Eigene Terminvorschläge: jeder Teilnehmer kann während der Sammelphase ein weiteres
-- Terminfenster einbringen (Spec §7: bester Termin soll aus mehreren echten Vorschlägen
-- gewinnen, nicht aus zwei fest vorgegebenen Optionen).
create function public.propose_date_option(
  p_participant_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(id uuid, start_date date, end_date date)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_trip_id uuid;
  v_status public.trip_status;
  v_new public.trip_date_options;
begin
  select trip_id into v_trip_id from public.trip_participants where id = p_participant_id;
  if not found then raise exception 'invalid_participant'; end if;

  select status into v_status from public.trips where id = v_trip_id;
  if v_status <> 'collecting' then raise exception 'trip_not_collecting'; end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_date_range';
  end if;

  insert into public.trip_date_options(trip_id, start_date, end_date)
  values (v_trip_id, p_start_date, p_end_date)
  returning * into v_new;

  return query select v_new.id, v_new.start_date, v_new.end_date;
end;
$$;

grant execute on function public.propose_date_option(uuid, date, date) to anon, authenticated;

-- Teilnehmerliste: get_trip_state bekommt ein participants-Array (Name + Zusage-Status),
-- damit die UI zeigt, wer dabei ist, statt nur eine Zahl.
create or replace function public.get_trip_state(p_participant_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_trip_id uuid;
  v_result jsonb;
begin
  select trip_id into v_trip_id from public.trip_participants where id = p_participant_id;
  if not found then raise exception 'invalid_participant'; end if;

  select jsonb_build_object(
    'trip', (select jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status,
               'deadline', t.deadline, 'locked_date_option_id', t.locked_date_option_id)
             from public.trips t where t.id = v_trip_id),
    'options', (select coalesce(jsonb_agg(
                  jsonb_build_object('id', o.id, 'start_date', o.start_date, 'end_date', o.end_date)
                  order by o.start_date), '[]'::jsonb)
                from public.trip_date_options o where o.trip_id = v_trip_id),
    'total_participants', (select count(*) from public.trip_participants p where p.trip_id = v_trip_id),
    'committed_count', (select count(*) from public.trip_participants p where p.trip_id = v_trip_id and p.is_committed),
    'participants', (select coalesce(jsonb_agg(
                        jsonb_build_object('id', p.id, 'display_name', p.display_name,
                          'is_committed', p.is_committed)
                        order by p.created_at), '[]'::jsonb)
                      from public.trip_participants p where p.trip_id = v_trip_id),
    'me', (select jsonb_build_object(
              'is_committed', mp.is_committed,
              'availabilities', (select coalesce(jsonb_agg(
                                   jsonb_build_object('date_option_id', a.date_option_id, 'availability', a.availability)),
                                   '[]'::jsonb)
                                 from public.date_availabilities a where a.participant_id = p_participant_id))
           from public.trip_participants mp where mp.id = p_participant_id),
    'locked_option', (select jsonb_build_object('start_date', o.start_date, 'end_date', o.end_date)
                      from public.trips t join public.trip_date_options o on o.id = t.locked_date_option_id
                      where t.id = v_trip_id)
  ) into v_result;

  return v_result;
end;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0009_date_proposals_and_participants.sql
git commit -m "feat(db): add propose_date_option RPC and participants list to get_trip_state"
```

---

### Task 2: Shared Domain — Datumsvalidierung für Terminvorschläge

**Files:**
- Create: `packages/shared/src/domain/date-options.ts`
- Test: `packages/shared/test/date-options.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Failing Test schreiben**

```typescript
// packages/shared/test/date-options.test.ts
import { describe, it, expect } from 'vitest';
import { validateDateOptionInput } from '../src/domain/date-options';

describe('validateDateOptionInput', () => {
  const today = '2026-03-01';

  it('accepts a valid future range', () => {
    expect(validateDateOptionInput('2026-03-14', '2026-03-16', today)).toEqual({ ok: true });
  });

  it('rejects when start date is missing', () => {
    expect(validateDateOptionInput('', '2026-03-16', today)).toEqual({
      ok: false,
      reason: 'missing_dates',
    });
  });

  it('rejects when end date is before start date', () => {
    expect(validateDateOptionInput('2026-03-16', '2026-03-14', today)).toEqual({
      ok: false,
      reason: 'end_before_start',
    });
  });

  it('rejects a start date in the past', () => {
    expect(validateDateOptionInput('2026-02-01', '2026-02-03', today)).toEqual({
      ok: false,
      reason: 'start_in_past',
    });
  });

  it('accepts the start date being today', () => {
    expect(validateDateOptionInput(today, '2026-03-05', today)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Test-Lauf verifizieren, dass er fehlschlägt**

Run: `pnpm --filter @anchor/shared test -- date-options`
Expected: FAIL mit „Cannot find module '../src/domain/date-options'"

- [ ] **Step 3: Minimalimplementierung schreiben**

```typescript
// packages/shared/src/domain/date-options.ts
export type DateOptionValidation =
  | { ok: true }
  | { ok: false; reason: 'missing_dates' | 'end_before_start' | 'start_in_past' };

export function validateDateOptionInput(
  startDate: string,
  endDate: string,
  today: string,
): DateOptionValidation {
  if (!startDate || !endDate) return { ok: false, reason: 'missing_dates' };
  if (endDate < startDate) return { ok: false, reason: 'end_before_start' };
  if (startDate < today) return { ok: false, reason: 'start_in_past' };
  return { ok: true };
}
```

- [ ] **Step 4: Test-Lauf verifizieren, dass er erfolgreich ist**

Run: `pnpm --filter @anchor/shared test -- date-options`
Expected: PASS (5/5)

- [ ] **Step 5: Export ergänzen**

In `packages/shared/src/index.ts` nach der `nudge`-Zeile ergänzen:

```typescript
export { validateDateOptionInput, type DateOptionValidation } from './domain/date-options';
```

- [ ] **Step 6: Typecheck + vollständige Testsuite**

Run: `pnpm typecheck && pnpm test`
Expected: alle Pakete grün (bestehende 42 Tests + 5 neue)

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/domain/date-options.ts packages/shared/test/date-options.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): add validateDateOptionInput for own date proposals"
```

---

### Task 3: Web — Terminvorschlag-Formular + Teilnehmerliste

**Files:**
- Modify: `apps/web/app/trip/[id]/page.tsx`

- [ ] **Step 1: `TripState`-Interface und Formular-State erweitern**

In `apps/web/app/trip/[id]/page.tsx` den Import erweitern und `TripState` um `participants` ergänzen:

```typescript
import { validateDateOptionInput, type Availability } from '@anchor/shared';
```

```typescript
interface ParticipantRow {
  id: string;
  display_name: string;
  is_committed: boolean;
}

interface TripState {
  trip: {
    id: string;
    title: string;
    status: string;
    deadline: string;
    locked_date_option_id: string | null;
  } | null;
  options: OptionRow[];
  total_participants: number;
  committed_count: number;
  participants: ParticipantRow[];
  me: {
    is_committed: boolean;
    availabilities: { date_option_id: string; availability: Availability }[];
  } | null;
  locked_option: { start_date: string; end_date: string } | null;
}
```

- [ ] **Step 2: Formular-State + Submit-Handler ergänzen**

Direkt nach den bestehenden `useState`-Aufrufen einfügen:

```typescript
  const [proposeStart, setProposeStart] = useState('');
  const [proposeEnd, setProposeEnd] = useState('');
  const [proposeError, setProposeError] = useState<string | null>(null);
```

Nach `toggleCommit` einfügen:

```typescript
  async function proposeDateOption() {
    if (!participantId) return;
    const today = new Date().toISOString().slice(0, 10);
    const validation = validateDateOptionInput(proposeStart, proposeEnd, today);
    if (!validation.ok) {
      setProposeError(
        validation.reason === 'missing_dates'
          ? 'Bitte beide Daten angeben.'
          : validation.reason === 'end_before_start'
            ? 'Das Enddatum muss nach dem Startdatum liegen.'
            : 'Das Startdatum darf nicht in der Vergangenheit liegen.',
      );
      return;
    }
    setProposeError(null);
    const { error } = await supabase.rpc('propose_date_option', {
      p_participant_id: participantId,
      p_start_date: proposeStart,
      p_end_date: proposeEnd,
    });
    if (error) {
      setProposeError(error.message);
      return;
    }
    setProposeStart('');
    setProposeEnd('');
    void refresh(participantId);
  }
```

- [ ] **Step 3: Formular + Teilnehmerliste im JSX ergänzen**

Nach dem `options.map(...)`-Block und vor dem `!isLocked && <button>...toggleCommit`-Block einfügen:

```tsx
      {!isLocked && (
        <div style={{ marginTop: 16, marginBottom: 16 }}>
          <h3 style={{ marginBottom: 8 }}>Eigenen Termin vorschlagen</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={proposeStart}
              onChange={(e) => setProposeStart(e.target.value)}
              style={{ padding: 8 }}
            />
            <input
              type="date"
              value={proposeEnd}
              onChange={(e) => setProposeEnd(e.target.value)}
              style={{ padding: 8 }}
            />
            <button onClick={proposeDateOption} style={{ padding: 8, cursor: 'pointer' }}>
              Vorschlagen
            </button>
          </div>
          {proposeError && <p style={{ color: 'crimson', marginTop: 8 }}>{proposeError}</p>}
        </div>
      )}

      <h2>Wer ist dabei</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {(state?.participants ?? []).map((p) => (
          <li key={p.id} style={{ padding: '4px 0' }}>
            {p.is_committed ? '✅' : '⏳'} {p.display_name}
          </li>
        ))}
      </ul>
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: keine Fehler

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/trip/[id]/page.tsx
git commit -m "feat(web): allow own date proposals and show participant list on trip page"
```

---

### Task 4: Mobile — Terminvorschlag-Formular + Teilnehmerliste

**Files:**
- Modify: `apps/mobile/app/trip/[id].tsx`

- [ ] **Step 1: Import + `TripState` erweitern**

```typescript
import { validateDateOptionInput, type Availability } from '@anchor/shared';
```

```typescript
interface ParticipantRow {
  id: string;
  display_name: string;
  is_committed: boolean;
}

interface TripState {
  trip: { status: string } | null;
  options: OptionRow[];
  total_participants: number;
  committed_count: number;
  participants: ParticipantRow[];
  me: {
    is_committed: boolean;
    availabilities: { date_option_id: string; availability: Availability }[];
  } | null;
  locked_option: { start_date: string; end_date: string } | null;
}
```

- [ ] **Step 2: Formular-State + Submit-Handler ergänzen**

Nach den bestehenden `useState`-Aufrufen:

```typescript
  const [proposeStart, setProposeStart] = useState('');
  const [proposeEnd, setProposeEnd] = useState('');
  const [proposeError, setProposeError] = useState<string | null>(null);
```

Nach `toggleCommit`:

```typescript
  async function proposeDateOption() {
    if (!participantId) return;
    const today = new Date().toISOString().slice(0, 10);
    const validation = validateDateOptionInput(proposeStart, proposeEnd, today);
    if (!validation.ok) {
      setProposeError(
        validation.reason === 'missing_dates'
          ? 'Bitte beide Daten im Format JJJJ-MM-TT angeben.'
          : validation.reason === 'end_before_start'
            ? 'Das Enddatum muss nach dem Startdatum liegen.'
            : 'Das Startdatum darf nicht in der Vergangenheit liegen.',
      );
      return;
    }
    setProposeError(null);
    setIsSubmitting(true);
    try {
      const { error } = await supabase.rpc('propose_date_option', {
        p_participant_id: participantId,
        p_start_date: proposeStart,
        p_end_date: proposeEnd,
      });
      if (error) {
        setProposeError(error.message);
        return;
      }
      setProposeStart('');
      setProposeEnd('');
      void refresh(participantId);
    } finally {
      setIsSubmitting(false);
    }
  }
```

- [ ] **Step 3: Formular + Teilnehmerliste im JSX ergänzen**

Nach dem `state.options.map(...)`-Block und vor `actionError`:

```tsx
      {!isLocked && (
        <View style={styles.proposeSection}>
          <Text style={styles.sectionTitle}>Eigenen Termin vorschlagen</Text>
          <View style={styles.proposeRow}>
            <TextInput
              value={proposeStart}
              onChangeText={setProposeStart}
              placeholder="Start JJJJ-MM-TT"
              placeholderTextColor="#8a8a94"
              style={styles.proposeInput}
            />
            <TextInput
              value={proposeEnd}
              onChangeText={setProposeEnd}
              placeholder="Ende JJJJ-MM-TT"
              placeholderTextColor="#8a8a94"
              style={styles.proposeInput}
            />
          </View>
          <Pressable style={styles.proposeButton} onPress={proposeDateOption} disabled={isSubmitting}>
            <Text style={styles.commitButtonText}>Vorschlagen</Text>
          </Pressable>
          {proposeError && <Text style={styles.error}>{proposeError}</Text>}
        </View>
      )}

      <Text style={styles.sectionTitle}>Wer ist dabei</Text>
      {state.participants.map((p) => (
        <Text key={p.id} style={styles.participantRow}>
          {p.is_committed ? '✅' : '⏳'} {p.display_name}
        </Text>
      ))}
```

Import `TextInput` zur bestehenden `react-native`-Import-Zeile hinzufügen:

```typescript
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
```

- [ ] **Step 4: Styles ergänzen**

In `StyleSheet.create({...})` nach `error` ergänzen:

```typescript
  proposeSection: { gap: 8, marginTop: 8 },
  proposeRow: { flexDirection: 'row', gap: 8 },
  proposeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#3a3a44',
    borderRadius: 8,
    padding: 10,
    color: '#fff',
    backgroundColor: '#17171d',
  },
  proposeButton: {
    backgroundColor: '#2f6fed',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  participantRow: { color: '#fff', fontSize: 14, paddingVertical: 2 },
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter mobile typecheck`
Expected: keine Fehler

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/trip/[id].tsx
git commit -m "feat(mobile): allow own date proposals and show participant list on trip screen"
```

---

### Task 5: Playwright-E2E für den neuen Flow

**Files:**
- Create: `apps/web/e2e/date-proposal.spec.ts`

- [ ] **Step 1: Test schreiben**

```typescript
// apps/web/e2e/date-proposal.spec.ts
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

test('guest proposes own date option and sees the participant list', async ({ page }) => {
  const { data: group } = await admin.from('groups').insert({ name: 'E2E-Proposal-Crew' }).select('id').single();
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data: trip } = await admin
    .from('trips')
    .insert({ group_id: group!.id, title: 'E2E Proposal Trip', deadline: future })
    .select('id, share_token').single();

  await page.goto(`/join/${encodeURIComponent(trip!.share_token)}`);
  await page.getByPlaceholder('Dein Name').fill('Vorschlag-Gast');
  await page.getByRole('button', { name: 'Beitreten' }).click();
  await expect(page).toHaveURL(new RegExp(`/trip/${trip!.id}`));

  await expect(page.getByText('⏳ Vorschlag-Gast')).toBeVisible();

  const dateInputs = page.locator('input[type="date"]');
  await dateInputs.nth(0).fill('2026-05-01');
  await dateInputs.nth(1).fill('2026-05-03');
  await page.getByRole('button', { name: 'Vorschlagen' }).click();

  await expect(page.getByText('2026-05-01 – 2026-05-03')).toBeVisible();

  const { data: options } = await admin
    .from('trip_date_options').select('start_date, end_date').eq('trip_id', trip!.id);
  expect(options).toContainEqual({ start_date: '2026-05-01', end_date: '2026-05-03' });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/e2e/date-proposal.spec.ts
git commit -m "test(e2e): cover own date proposal and participant list"
```

---

### Task 6: Migration + E2E gegen CT 113 ausführen (nach Freigabe)

**Nicht ohne gesonderte Bestätigung ausführen** — betrifft die live laufende App auf `anchor.kek95.duckdns.org`.

- [ ] **Step 1:** Migration `0009_date_proposals_and_participants.sql` per SSH auf CT 113 gegen die Supabase-Postgres-Instanz anwenden (gleicher Weg wie 0001–0008, siehe `HOMELAB.md`).
- [ ] **Step 2:** `apps/web` neu bauen (`pnpm exec next build`) und `anchor-web.service` neu starten (Next.js liest `public/`/Build nur beim Start neu ein, siehe [[freundes-trip-app]]-Memory).
- [ ] **Step 3:** Playwright-Suite (`termin-lock.spec.ts` + neuer `date-proposal.spec.ts`) gegen CT 113 laufen lassen.
- [ ] **Step 4:** Mobile-App-Build auf CT 116 nur bei Bedarf (Deploy-Ablauf siehe [[freundes-trip-app]]-Memory) — kann auch separat nachgezogen werden, da die Mobile-App aktuell nur lokal läuft.

---

## Self-Review

**Spec-Abdeckung:** Deckt die zwei in der Gap-Analyse benannten Punkte ab (§7 „mehrere echte Terminvorschläge" statt zwei fixer Optionen; sichtbare Teilnehmerliste, die über die reine „7/10 dabei"-Zahl hinausgeht). Unterkunft, Kosten, Nudges, Gruppen-Persistenz und Auth sind bewusst **nicht** Teil dieses Plans — das sind die nächsten Scheiben laut Roadmap.

**Platzhalter-Scan:** Keine TBDs; jeder Schritt enthält vollständigen Code.

**Typkonsistenz:** `ParticipantRow`, `DateOptionValidation` und `validateDateOptionInput` werden in Web und Mobile identisch benannt und verwendet; `participants` ist in beiden `TripState`-Interfaces gleich benannt wie im SQL-`jsonb_build_object`-Schlüssel.
