-- RLS-Härtung für öffentliche (Internet-)Exposition.
-- Alle direkten SELECTs für anon/authenticated werden entfernt; jeglicher Zugriff läuft
-- ausschließlich über security-definer-RPCs (capability-basiert über UUID/Token).
-- Damit ist keine Enumeration der Tabellen mehr möglich.

-- 1) Offene SELECT-Policies entfernen (Default-Deny bleibt aktiv, RLS ist an)
drop policy if exists "groups readable by anyone with the row (token-scoped queries)" on public.groups;
drop policy if exists "trips readable" on public.trips;
drop policy if exists "date options readable" on public.trip_date_options;
drop policy if exists "participants readable" on public.trip_participants;
drop policy if exists "availabilities readable" on public.date_availabilities;
drop policy if exists "link guests readable" on public.link_guests;

-- 2) Trip anlegen (Creator-Pfad ohne Auth für die Beta) — Gruppe + Trip + Terminfenster
create or replace function public.create_trip(
  p_title text,
  p_destination text,
  p_deadline timestamptz,
  p_date_options jsonb
)
returns table(trip_id uuid, share_token text)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_group_id uuid;
  v_trip public.trips;
  v_opt jsonb;
begin
  if coalesce(trim(p_title), '') = '' then raise exception 'title_required'; end if;

  insert into public.groups(name) values (p_title || ' Crew') returning id into v_group_id;

  insert into public.trips(group_id, title, destination, deadline)
  values (v_group_id, p_title, nullif(trim(coalesce(p_destination,'')), ''), p_deadline)
  returning * into v_trip;

  for v_opt in select value from jsonb_array_elements(coalesce(p_date_options, '[]'::jsonb))
  loop
    insert into public.trip_date_options(trip_id, start_date, end_date)
    values (v_trip.id, (v_opt->>'start_date')::date, (v_opt->>'end_date')::date);
  end loop;

  return query select v_trip.id, v_trip.share_token;
end;
$$;

-- 3) Kompletter Trip-Zustand für die Trip-Seite (Polling), gebunden an participant-UUID
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

-- 4) Öffentliche Trip-Vorschau für die Join-Landing (nur Titel/Status)
create or replace function public.get_trip_public(p_token text)
returns jsonb
language plpgsql
security definer set search_path = public, extensions
as $$
declare v_trip public.trips;
begin
  select * into v_trip from public.trips where share_token = p_token;
  if not found then return null; end if;
  return jsonb_build_object('title', v_trip.title, 'status', v_trip.status);
end;
$$;

-- 5) Ausführungsrechte
grant execute on function public.create_trip(text, text, timestamptz, jsonb) to anon, authenticated;
grant execute on function public.get_trip_state(uuid) to anon, authenticated;
grant execute on function public.get_trip_public(text) to anon, authenticated;
