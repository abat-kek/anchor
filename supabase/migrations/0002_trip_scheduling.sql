-- Link-Gäste (nicht-authentifizierte Teilnehmer)
create table public.link_guests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  display_name text not null,
  email text,
  converted_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.link_guests enable row level security;

-- Trips
create type public.trip_status as enum
  ('draft', 'collecting', 'locked', 'accommodation', 'active', 'done');

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  status public.trip_status not null default 'collecting',
  destination text,
  deadline timestamptz not null,
  share_token text not null unique default encode(gen_random_bytes(9), 'base64'),
  locked_date_option_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.trips enable row level security;

-- Teilnehmer eines Trips (App-User ODER Link-Gast)
create table public.trip_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references auth.users(id),
  link_guest_id uuid references public.link_guests(id) on delete cascade,
  display_name text not null,
  is_committed boolean not null default false,
  created_at timestamptz not null default now(),
  constraint participant_is_user_or_guest
    check (num_nonnulls(user_id, link_guest_id) = 1)
);
alter table public.trip_participants enable row level security;

-- Terminfenster
create table public.trip_date_options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  start_date date not null,
  end_date date not null
);
alter table public.trip_date_options enable row level security;

-- Verfügbarkeit je Teilnehmer je Terminfenster
create type public.availability as enum ('yes', 'maybe', 'no');

create table public.date_availabilities (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  date_option_id uuid not null references public.trip_date_options(id) on delete cascade,
  participant_id uuid not null references public.trip_participants(id) on delete cascade,
  availability public.availability not null,
  unique (date_option_id, participant_id)
);
alter table public.date_availabilities enable row level security;

-- FK für locked_date_option nachziehen
alter table public.trips
  add constraint trips_locked_option_fk
  foreign key (locked_date_option_id) references public.trip_date_options(id);

-- v1-Lesepolicies: Trip-Kontext ist über share_token/participant-UUID zugänglich.
-- Für den Link-first-Flow lesen wir serverseitig; einfache Read-Policies:
create policy "trips readable" on public.trips for select using (true);
create policy "date options readable" on public.trip_date_options for select using (true);
create policy "participants readable" on public.trip_participants for select using (true);
create policy "availabilities readable" on public.date_availabilities for select using (true);
create policy "link guests readable" on public.link_guests for select using (true);

-- Schreiben läuft ausschließlich über RPCs (Task 4), daher keine INSERT/UPDATE-Policies hier.

-- Realtime für Live-Zähler aktivieren
alter publication supabase_realtime add table public.trip_participants;
alter publication supabase_realtime add table public.date_availabilities;
alter publication supabase_realtime add table public.trips;
