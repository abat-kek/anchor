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

-- set null statt cascade: ein geloeschter Vorschlag soll den Trip nicht mitloeschen,
-- die Kuerung faellt dabei aber trotzdem weg — set null verhindert nur den Fehler,
-- nicht den Verlust. Die Kette ist: Teilnehmer geloescht -> seine Option kaskadiert
-- (added_by_participant_id, oben) -> chosen_accommodation_id wird null, waehrend der
-- Trip auf status='active' stehen bleibt. Beide Oberflaechen zeigen dann die
-- Optionsliste ohne Handlungsmoeglichkeit. Heute unerreichbar, weil es keinen
-- Loesch-RPC fuer Teilnehmer gibt; wenn einer kommt, muss er diesen Fall aufraeumen.
alter table public.trips
  add column chosen_accommodation_id uuid references public.accommodation_options(id) on delete set null;

-- kein Zusatzindex auf accommodation_votes(option_id): unique(option_id, participant_id)
-- legt bereits einen fuehrenden B-Tree auf option_id an, der alle Zugriffe hier bedient.
create index accommodation_options_trip_idx on public.accommodation_options(trip_id, created_at);

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
  v_status public.trip_status;
  v_option_trip_id uuid;
  v_deleted integer;
begin
  select tp.trip_id into v_trip_id
    from public.trip_participants tp where tp.id = p_participant_id;
  if not found then raise exception 'invalid_participant'; end if;

  -- Gleiche Regel wie in add_accommodation_option: eine clientseitige Sperre nach der Kuerung
  -- waere per direktem RPC-Aufruf umgehbar, sonst laufen vote_count/chosen_accommodation auseinander.
  select t.status into v_status from public.trips t where t.id = v_trip_id;
  if v_status not in ('locked', 'accommodation') then
    raise exception 'trip_not_in_accommodation_phase';
  end if;

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
-- Bewusst anon, obwohl lock_trip (0003) nur authenticated kennt: das Abnahmekriterium dieser
-- Scheibe verlangt woertlich, dass ein Gast ueber den Live-Link kueren kann, und Gaeste haben
-- ausschliesslich den anon-Key. Creator-Auth existiert in diesem Projekt bis heute nicht.
grant execute on function public.choose_accommodation(uuid, uuid) to anon, authenticated;

-- get_trip_state um Unterkunfts-Block erweitern (Fassung aus 0009, nichts gestrichen).
-- Alle Spaltenreferenzen ueber Tabellen-Alias qualifiziert, auch bei "returns jsonb":
-- gleicher Stil wie die Funktionen oben, damit hier kein "ambiguous"-Fehler wie in
-- Slice 1b entsteht, sobald diese Funktion spaeter OUT-Parameter bekommt.
create or replace function public.get_trip_state(p_participant_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_trip_id uuid;
  v_result jsonb;
begin
  select tp.trip_id into v_trip_id
    from public.trip_participants tp where tp.id = p_participant_id;
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
                      where t.id = v_trip_id),
    'accommodation', jsonb_build_object(
      'options', (select coalesce(jsonb_agg(
                    jsonb_build_object('id', ao.id, 'raw_url', ao.raw_url, 'title', ao.title,
                      'image_url', ao.image_url, 'price_cents', ao.price_cents, 'currency', ao.currency,
                      'parse_status', ao.parse_status, 'created_at', ao.created_at,
                      'vote_count', (select count(*) from public.accommodation_votes av
                                      where av.option_id = ao.id))
                    order by ao.created_at), '[]'::jsonb)
                  from public.accommodation_options ao where ao.trip_id = v_trip_id),
      'my_votes', (select coalesce(jsonb_agg(av.option_id), '[]'::jsonb)
                    from public.accommodation_votes av
                    join public.accommodation_options ao on ao.id = av.option_id
                   where ao.trip_id = v_trip_id and av.participant_id = p_participant_id),
      'chosen_accommodation', (select jsonb_build_object('id', ao.id, 'raw_url', ao.raw_url,
                                  'title', ao.title, 'image_url', ao.image_url,
                                  'price_cents', ao.price_cents, 'currency', ao.currency)
                                from public.trips t join public.accommodation_options ao
                                  on ao.id = t.chosen_accommodation_id
                                where t.id = v_trip_id)
    )
  ) into v_result;

  return v_result;
end;
$$;
