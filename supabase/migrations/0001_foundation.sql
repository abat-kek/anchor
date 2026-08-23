-- Profiles (1:1 zu auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Anchor User',
  push_token text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-Profil bei neuem User
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Anchor User'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Groups (minimal, für Anbindungs-Smoke; volle Nutzung in Scheibe 1)
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_token text not null unique default encode(gen_random_bytes(9), 'base64'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

alter table public.groups enable row level security;

-- Öffentlich lesbar per invite_token (Link-first); Schreiben nur eingeloggt.
create policy "groups readable by anyone with the row (token-scoped queries)"
  on public.groups for select using (true);

create policy "authenticated users can create groups"
  on public.groups for insert to authenticated
  with check (auth.uid() = created_by);
