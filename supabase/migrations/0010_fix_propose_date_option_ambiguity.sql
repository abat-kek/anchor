-- Fix zu 0009: die OUT-Spalten aus "returns table(id, start_date, end_date)" sind innerhalb
-- der Funktion PL/pgSQL-Variablen und kollidieren mit den gleichnamigen Tabellenspalten
-- ("column reference id is ambiguous"). Die Funktion aus 0009 war dadurch nie aufrufbar.
-- Auffaellig wurde das erst beim Aufruf gegen die echte Datenbank, nicht im Typecheck.
-- Fix: jede Spaltenreferenz im Rumpf ueber einen Tabellen-Alias qualifizieren.
create or replace function public.propose_date_option(
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
  select tp.trip_id into v_trip_id
    from public.trip_participants tp
   where tp.id = p_participant_id;
  if not found then raise exception 'invalid_participant'; end if;

  select t.status into v_status
    from public.trips t
   where t.id = v_trip_id;
  if v_status <> 'collecting' then raise exception 'trip_not_collecting'; end if;

  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'invalid_date_range';
  end if;

  -- Dieselbe Regel wie validateDateOptionInput im Client, hier aber verbindlich:
  -- RLS laesst nur RPC-Aufrufe zu, ein direkter Aufruf mit gueltiger participant_id
  -- umginge eine rein clientseitige Pruefung vollstaendig.
  if p_start_date < current_date then
    raise exception 'start_in_past';
  end if;

  insert into public.trip_date_options(trip_id, start_date, end_date)
  values (v_trip_id, p_start_date, p_end_date)
  returning * into v_new;

  return query select v_new.id, v_new.start_date, v_new.end_date;
end;
$$;

grant execute on function public.propose_date_option(uuid, date, date) to anon, authenticated;
