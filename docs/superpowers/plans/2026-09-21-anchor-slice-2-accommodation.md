# Anchor Slice 2 — Unterkunfts-Kuerung: Implementation Plan

**Datum:** 2026-09-21
**Basis:** [Grobplan Scheiben 2–4](2026-09-21-scheiben-2-4-grobplan.md) (Entscheidungen E1–E12),
[Roadmap](2026-08-23-anchor-v1-roadmap.md) §6, [Spec](../specs/2026-08-23-freundes-trip-app-design.md) §3.4

**Architektur in einem Satz:** Zwei neue Tabellen (`accommodation_options`,
`accommodation_votes`) plus vier `security definer`-RPCs nach dem Muster aus 0003/0009; der
manuelle Eingabepfad wird zuerst gebaut (E1), das Open-Graph-Parsing kommt als eigene,
abschaltbare Zugabe danach; Mehrfachstimmen (E2) heisst, die Stimme ist ein Umschalter je
Option, nicht eine Auswahl je Person.

---

## Vorbedingungen

- `master` auf Stand Slice 1b (Migrationen bis 0010 live auf CT 113).
- Arbeit in einem eigenen Worktree, nicht im Haupt-Checkout.
- **Vor der ersten Zeile SQL:** die beiden Lehren aus dem Slice-1b-Lauf gelten
  (`docs/superpowers/NACHTLAUF-STATUS-SLICE-1B.md`):
  1. In jeder PL/pgSQL-Funktion mit `returns table(...)` **jede** Spaltenreferenz im Rumpf
     ueber einen Tabellen-Alias qualifizieren.
  2. Jede neue Funktion nach dem Einspielen mindestens einmal **live** aufrufen — Erfolgsfall
     und ein erwarteter Fehlerfall — bevor der Deploy als fertig gilt.

---

## Task 1: Migration 0011 — Tabellen und RPCs (manueller Pfad)

**Datei:** `supabase/migrations/0011_accommodation.sql`

- [ ] **Step 1: Tabellen und Statuswerte**

```sql
-- Unterkunfts-Vorschlaege. raw_url wird IMMER gespeichert (Spec: affiliate-ready),
-- affiliate_url bleibt vorerst leer und ist nur vorgehalten.
create type public.parse_status as enum ('manual', 'pending', 'ok', 'failed');

create table public.accommodation_options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  added_by_participant_id uuid not null references public.trip_participants(id) on delete cascade,
  raw_url text not null,
  title text not null,
  image_url text,
  price_cents integer,
  currency text not null default 'EUR',
  affiliate_url text,
  parse_status public.parse_status not null default 'manual',
  created_at timestamptz not null default now(),
  constraint price_not_negative check (price_cents is null or price_cents >= 0)
);
alter table public.accommodation_options enable row level security;

-- Approval Voting (E2): ein Teilnehmer darf mehrere Optionen billigen, aber jede nur einmal.
create table public.accommodation_votes (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.accommodation_options(id) on delete cascade,
  participant_id uuid not null references public.trip_participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (option_id, participant_id)
);
alter table public.accommodation_votes enable row level security;

alter table public.trips
  add column chosen_accommodation_id uuid references public.accommodation_options(id);

create index accommodation_options_trip_idx on public.accommodation_options(trip_id, created_at);
create index accommodation_votes_option_idx on public.accommodation_votes(option_id);
```

- [ ] **Step 2: RPCs**

Alle vier leiten `trip_id` serverseitig aus `p_participant_id` ab — der Client uebergibt
niemals eine `trip_id`. Jede Spaltenreferenz qualifiziert.

```sql
-- Vorschlag hinzufuegen (manueller Pfad: Titel kommt vom Nutzer).
create function public.add_accommodation_option(
  p_participant_id uuid,
  p_raw_url text,
  p_title text,
  p_price_cents integer default null,
  p_currency text default 'EUR'
)
returns table(option_id uuid)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_trip_id uuid;
  v_status public.trip_status;
  v_new_id uuid;
begin
  select tp.trip_id into v_trip_id
    from public.trip_participants tp where tp.id = p_participant_id;
  if not found then raise exception 'invalid_participant'; end if;

  select t.status into v_status from public.trips t where t.id = v_trip_id;
  if v_status not in ('locked', 'accommodation') then
    raise exception 'trip_not_in_accommodation_phase';
  end if;

  if coalesce(trim(p_raw_url), '') = '' then raise exception 'url_required'; end if;
  if p_raw_url !~* '^https?://' then raise exception 'url_invalid'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'title_required'; end if;
  if p_price_cents is not null and p_price_cents < 0 then raise exception 'price_invalid'; end if;

  insert into public.accommodation_options
    (trip_id, added_by_participant_id, raw_url, title, price_cents, currency)
  values (v_trip_id, p_participant_id, trim(p_raw_url), trim(p_title), p_price_cents, p_currency)
  returning accommodation_options.id into v_new_id;

  -- Erster Vorschlag schaltet den Trip in die Unterkunftsphase.
  update public.trips t set status = 'accommodation'
   where t.id = v_trip_id and t.status = 'locked';

  return query select v_new_id;
end;
$$;

-- Stimme umschalten (E2: Mehrfachstimmen). Gibt den neuen Zustand zurueck.
create function public.toggle_accommodation_vote(
  p_participant_id uuid,
  p_option_id uuid
)
returns table(is_voted boolean)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_trip_id uuid;
  v_option_trip_id uuid;
  v_deleted integer;
begin
  select tp.trip_id into v_trip_id
    from public.trip_participants tp where tp.id = p_participant_id;
  if not found then raise exception 'invalid_participant'; end if;

  select ao.trip_id into v_option_trip_id
    from public.accommodation_options ao where ao.id = p_option_id;
  if not found then raise exception 'invalid_option'; end if;
  -- Verhindert, dass ein Teilnehmer in einem fremden Trip abstimmt.
  if v_option_trip_id <> v_trip_id then raise exception 'option_not_in_trip'; end if;

  delete from public.accommodation_votes av
   where av.option_id = p_option_id and av.participant_id = p_participant_id;
  get diagnostics v_deleted = row_count;

  if v_deleted > 0 then
    return query select false;
  else
    insert into public.accommodation_votes (option_id, participant_id)
    values (p_option_id, p_participant_id);
    return query select true;
  end if;
end;
$$;

-- Kuerung. Gewinner wird uebergeben, nicht berechnet: die Auswertung inkl.
-- Gleichstandsregel liegt in packages/shared (E3/E4).
create function public.choose_accommodation(
  p_participant_id uuid,
  p_option_id uuid
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_trip_id uuid;
  v_option_trip_id uuid;
begin
  select tp.trip_id into v_trip_id
    from public.trip_participants tp where tp.id = p_participant_id;
  if not found then raise exception 'invalid_participant'; end if;

  select ao.trip_id into v_option_trip_id
    from public.accommodation_options ao where ao.id = p_option_id;
  if not found then raise exception 'invalid_option'; end if;
  if v_option_trip_id <> v_trip_id then raise exception 'option_not_in_trip'; end if;

  update public.trips t
     set chosen_accommodation_id = p_option_id, status = 'active'
   where t.id = v_trip_id and t.status = 'accommodation';
  if not found then raise exception 'trip_not_in_accommodation_phase'; end if;
end;
$$;

grant execute on function public.add_accommodation_option(uuid, text, text, integer, text) to anon, authenticated;
grant execute on function public.toggle_accommodation_vote(uuid, uuid) to anon, authenticated;
grant execute on function public.choose_accommodation(uuid, uuid) to anon, authenticated;
```

- [ ] **Step 3: `get_trip_state` erweitern**

`create or replace` auf die Fassung aus 0010, ergaenzt um einen `accommodation`-Block:
Liste der Optionen (mit `vote_count` und `created_at` fuer die Gleichstandsregel), die eigenen
Stimmen als `my_votes`-Array von Option-IDs, und `chosen_accommodation`. Reihenfolge der
Optionen: `order by ao.created_at` — die Gleichstandsregel aus E3 braucht genau diese
Reihenfolge.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0011_accommodation.sql
git commit -m "feat(db): add accommodation options, approval votes and choice RPCs"
```

---

## Task 2: Shared Domain — Gewinnerermittlung mit Gleichstandsregel

**Warum neu, wenn `voting.ts` existiert?** `tallyVotes` zaehlt korrekt und bleibt unveraendert.
`winningOption` hat aber **keine** definierte Gleichstandsregel und nimmt schlicht den ersten
Treffer — E3 verlangt „aeltester Vorschlag gewinnt". Statt die bestehende, 9-fach getestete
Funktion umzubauen, kommt eine zweite daneben.

- [ ] **Step 1: Failing Test** in `packages/shared/test/accommodation.test.ts`

Faelle: klarer Gewinner; Gleichstand zwischen zwei Optionen → die aeltere gewinnt; keine
Stimmen → `null`; leere Liste → `null`; eine Option mit Stimmen, eine ohne.

- [ ] **Step 2: Test laufen lassen und Fehlschlag bestaetigen** (nicht ueberspringen)

- [ ] **Step 3: Minimalimplementierung** in `packages/shared/src/domain/accommodation.ts`

```typescript
export interface AccommodationTally {
  optionId: string;
  voteCount: number;
  createdAt: string; // ISO datetime, entscheidet den Gleichstand
}

/**
 * Gewinner nach Approval Voting (E2). Bei Gleichstand gewinnt der aeltere
 * Vorschlag (E3) — nicht die Eingabereihenfolge des Arrays.
 * Gibt null zurueck, solange keine einzige Stimme abgegeben wurde.
 */
export function resolveAccommodationWinner(
  tallies: AccommodationTally[],
): string | null;
```

- [ ] **Step 4: Test gruen, Export in `index.ts`, `pnpm typecheck` + `pnpm test`**
- [ ] **Step 5: Commit**

---

## Task 3: Web — Vorschlaege, Abstimmen, Kuerung

**Datei:** `apps/web/app/trip/[id]/page.tsx`

- [ ] **Step 1:** `TripState` um den `accommodation`-Block erweitern.
- [ ] **Step 2:** Formular „Unterkunft vorschlagen": URL, Titel, Preis (optional).
      **Mit Absende-Guard** — der HIGH-Befund aus Slice 1b darf sich nicht wiederholen.
- [ ] **Step 3:** Liste der Vorschlaege mit Stimmenzahl; die eigenen Stimmen sichtbar als
      angehakt; Klick schaltet um (`toggle_accommodation_vote`).
- [ ] **Step 4:** „Diese Unterkunft nehmen wir"-Knopf, vorbelegt mit
      `resolveAccommodationWinner`; nach der Kuerung nur noch die Gewinnerkarte plus Link.
- [ ] **Step 5:** Fehlercodes uebersetzen (`url_invalid` → „Das sieht nicht nach einem Link
      aus."). Offener Punkt 3 aus dem Slice-1b-Protokoll — hier gleich richtig machen.
- [ ] **Step 6:** `pnpm typecheck`, Commit.

---

## Task 4: Mobile — dasselbe nativ

**Datei:** `apps/mobile/app/trip/[id].tsx`

Fachlich gleichwertig zu Task 3 (das war ein ausdruecklicher Reviewpunkt in 1b). Zusaetzlich:
Preis als Zahlenfeld mit `keyboardType="decimal-pad"`, Bild der Option anzeigen, sobald das
Parsing es liefert. Absende-Guard ueber den bereits vorhandenen `isSubmitting`-Zustand.

---

## Task 5: E2E

**Datei:** `apps/web/e2e/accommodation.spec.ts`

Gast tritt bei → Trip auf `locked` setzen → zwei Unterkuenfte vorschlagen → beide billigen →
Stimmenzahl pruefen → eine Stimme zuruecknehmen → kueren → Gewinner steht in der Datenbank.
**Keine festen Datumswerte oder Kalenderdaten** — die Lehre aus 1b.

---

## Task 6: Open-Graph-Parsing als Zugabe (E1 — erst NACH Task 1–5)

**Datei:** `supabase/functions/parse-accommodation/index.ts`

- [ ] **Step 1: Erst messen, dann bauen.** Von CT 113 aus je eine echte Airbnb- und
      Booking-URL abrufen und nachsehen, ob brauchbare `og:`-Tags zurueckkommen. Kommt nichts
      Brauchbares, endet Task 6 hier mit einem Vermerk — der manuelle Pfad ist bereits
      vollwertig, und es wird **keine** Zeit in Umgehungsversuche gesteckt.
- [ ] **Step 2:** Funktion: nimmt `option_id`, holt die Seite mit Zeitlimit, liest
      `og:title`/`og:image`/`og:price:amount`, schreibt Felder zurueck, setzt `parse_status`
      auf `ok` oder `failed`. Nur `https`, Antwortgroesse begrenzen, Weiterleitungen begrenzen.
- [ ] **Step 3:** Die Oberflaechen zeigen bei `failed` unveraendert die manuellen Angaben —
      kein Fehlerdialog, das ist kein Ausnahmefall.

---

## Task 7: Ausrollen (nach Freigabe — Warnblock faellig)

1. Migration 0011 auf CT 113 einspielen, **vorher** `pg_dump` nach `/opt/anchor/backups/`.
2. Jede neue RPC einmal live aufrufen, Erfolgs- und Fehlerfall.
3. Web-Deploy: Tarball **per `git archive HEAD`** bauen, nicht aus dem Arbeitsverzeichnis
   (sonst reist `.env.local` wieder mit). Danach Build-Log auf `Environments: .env.production`
   pruefen und die ausgelieferten Chunks gegen die API-Domain greppen.
4. APK auf CT 116 bauen, Fingerprint gegen `5bb811da…8d7f` pruefen.
5. Testdaten wieder loeschen.

---

## Selbstpruefung vor „fertig"

- [ ] Kann ein Teilnehmer in einem fremden Trip abstimmen oder kueren? (Muss scheitern.)
- [ ] Sind Web und Mobile fachlich gleichwertig?
- [ ] Hat jedes Formular einen Absende-Guard?
- [ ] Wurde jede neue Datenbankfunktion live aufgerufen?
- [ ] Sind alle Fehlercodes uebersetzt?
