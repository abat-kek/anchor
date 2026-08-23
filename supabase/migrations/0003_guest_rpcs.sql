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
