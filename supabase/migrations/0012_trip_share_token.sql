-- Einladungslink eines Trips abrufen. Diese RPC wird nur fuer das Teilen des Links
-- genutzt, nicht fuer den Beitritt selbst (der laeuft ueber join_trip in 0003).
-- Eine eigene RPC ist sauberer als share_token zu get_trip_state hinzuzufuegen, weil:
-- 1. get_trip_state ist bereits gross (>200 Zeilen) und komplex
-- 2. Der Share-Token ist fuer den Reiter nicht noetigt und sollte nicht in jeden
--    Poll mitgesendet werden
-- 3. Das Token wird nur beim Teilen-Knopf gebraucht, nicht bei jedem Seitenladevorgang

create function public.get_trip_share_token(p_participant_id uuid)
returns text
language plpgsql
security definer set search_path = public, extensions
as $$
declare
  v_trip_id uuid;
  v_share_token text;
begin
  -- Trip-ID aus Participant ableiten; raise wenn nicht vorhanden
  select tp.trip_id into v_trip_id
    from public.trip_participants tp where tp.id = p_participant_id;
  if not found then raise exception 'invalid_participant'; end if;

  -- Share-Token aus Trip auslesen
  select t.share_token into v_share_token
    from public.trips t where t.id = v_trip_id;

  return v_share_token;
end;
$$;

grant execute on function public.get_trip_share_token(uuid) to anon, authenticated;
