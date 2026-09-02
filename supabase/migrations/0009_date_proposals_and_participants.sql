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
