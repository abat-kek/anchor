-- Auto-Lock als reine SQL-Funktion (self-hosted-tauglich, ersetzt pg_net/Edge-Function-Aufruf).
-- Spiegelt die Deadline-Logik aus packages/shared/src/domain/lock.ts (resolveLock):
-- bei überschrittener Deadline den best-besuchten Termin unter committed Teilnehmern locken
-- (max 'yes', dann max 'maybe', dann frühestes Startdatum; kein tragfähiger Termin -> nichts).

create or replace function public.run_auto_lock()
returns integer
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_trip record;
  v_best uuid;
  v_locked integer := 0;
begin
  for v_trip in
    select id from public.trips where status = 'collecting' and deadline <= now()
  loop
    select o.id into v_best
    from public.trip_date_options o
    left join public.date_availabilities a
      on a.date_option_id = o.id
     and a.participant_id in (
       select id from public.trip_participants where trip_id = v_trip.id and is_committed
     )
    where o.trip_id = v_trip.id
    group by o.id, o.start_date
    having count(*) filter (where a.availability = 'yes') > 0
        or count(*) filter (where a.availability = 'maybe') > 0
    order by count(*) filter (where a.availability = 'yes') desc,
             count(*) filter (where a.availability = 'maybe') desc,
             o.start_date asc
    limit 1;

    if v_best is not null then
      update public.trips
      set status = 'locked', locked_date_option_id = v_best
      where id = v_trip.id;
      v_locked := v_locked + 1;
    end if;
  end loop;

  return v_locked;
end;
$$;

grant execute on function public.run_auto_lock() to service_role;

-- pg_cron-Job auf direkten Funktionsaufruf umstellen (idempotent: schedule aktualisiert per Name)
select cron.schedule('anchor-auto-lock', '*/15 * * * *', $$ select public.run_auto_lock(); $$);
