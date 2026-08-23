-- Share-/Invite-Tokens URL-sicher machen (base64url statt base64: +/ -> -_).
-- gen_random_bytes(9) -> exakt 12 Zeichen, kein '='-Padding.
alter table public.trips
  alter column share_token set default translate(encode(gen_random_bytes(9), 'base64'), '+/', '-_');

alter table public.groups
  alter column invite_token set default translate(encode(gen_random_bytes(9), 'base64'), '+/', '-_');
