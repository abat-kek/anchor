-- create_trip legt den Ersteller gleich als Teilnehmer an und gibt dessen participant_id
-- zurück, damit der Creator-Client (Mobile) get_trip_state nutzen kann.
-- Return-Typ ändert sich -> drop + create.

drop function if exists public.create_trip(text, text, timestamptz, jsonb);

create function public.create_trip(
  p_title text,
  p_destination text,
  p_deadline timestamptz,
  p_date_options jsonb
)
returns table(trip_id uuid, share_token text, participant_id uuid)
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_group_id uuid;
  v_trip public.trips;
  v_opt jsonb;
  v_guest_id uuid;
  v_participant_id uuid;
begin
  if coalesce(trim(p_title), '') = '' then raise exception 'title_required'; end if;

  insert into public.groups(name) values (p_title || ' Crew') returning id into v_group_id;

  insert into public.trips(group_id, title, destination, deadline)
  values (v_group_id, p_title, nullif(trim(coalesce(p_destination, '')), ''), p_deadline)
  returning * into v_trip;

  for v_opt in select value from jsonb_array_elements(coalesce(p_date_options, '[]'::jsonb))
  loop
    insert into public.trip_date_options(trip_id, start_date, end_date)
    values (v_trip.id, (v_opt->>'start_date')::date, (v_opt->>'end_date')::date);
  end loop;

  insert into public.link_guests(group_id, display_name)
  values (v_group_id, 'Organisator') returning id into v_guest_id;

  insert into public.trip_participants(trip_id, link_guest_id, display_name)
  values (v_trip.id, v_guest_id, 'Organisator') returning id into v_participant_id;

  return query select v_trip.id, v_trip.share_token, v_participant_id;
end;
$$;

grant execute on function public.create_trip(text, text, timestamptz, jsonb) to anon, authenticated;
