-- Raksha initial schema.
-- Security model: every table has RLS ENABLED with NO policies, so the anon/authenticated
-- Supabase keys can read nothing. All access goes through the Raksha API using the server-side
-- DATABASE_URL, where authorization is enforced per request (user-scoped queries).

create extension if not exists pgcrypto;
create extension if not exists citext;

-- ---------------------------------------------------------------- users
create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           citext unique,
  phone           text unique,
  name            text not null check (char_length(name) between 1 and 80),
  role            text not null default 'user' check (role in ('user', 'admin')),
  locale          text not null default 'en',
  password_hash   text,
  google_sub      text unique,
  preferences     jsonb not null default '{}'::jsonb,
  avatar_url      text,
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint users_has_identity check (email is not null or phone is not null)
);

-- ---------------------------------------------------------------- sessions
create table if not exists sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    text not null unique,
  client        text not null default 'web' check (client in ('web', 'android')),
  user_agent    text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists sessions_user_idx on sessions (user_id);
create index if not exists sessions_expiry_idx on sessions (expires_at);

create table if not exists auth_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  purpose      text not null check (purpose in ('password_reset')),
  token_hash   text not null unique,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists otp_codes (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null,
  code_hash    text not null,
  expires_at   timestamptz not null,
  attempts     int not null default 0,
  consumed_at  timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists otp_phone_idx on otp_codes (phone, created_at desc);

-- ---------------------------------------------------------------- trusted contacts
create table if not exists trusted_contacts (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  name                 text not null check (char_length(name) between 1 and 80),
  phone                text,
  email                citext,
  relationship         text not null check (relationship in ('mother','father','brother','sister','partner','friend','relative','custom')),
  custom_relationship  text,
  locale               text not null default 'en',
  notify_sms           boolean not null default true,
  notify_email         boolean not null default true,
  notify_push          boolean not null default true,
  is_primary           boolean not null default false,
  alert_token_hash     text unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint contact_reachable check (phone is not null or email is not null)
);
create index if not exists contacts_user_idx on trusted_contacts (user_id);
-- At most one primary contact per user.
create unique index if not exists contacts_one_primary on trusted_contacts (user_id) where is_primary;

create table if not exists push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references users(id) on delete cascade,
  contact_id     uuid references trusted_contacts(id) on delete cascade,
  endpoint       text not null unique,
  p256dh         text not null,
  auth           text not null,
  failure_count  int not null default 0,
  created_at     timestamptz not null default now(),
  constraint push_owner check (user_id is not null or contact_id is not null)
);
create index if not exists push_user_idx on push_subscriptions (user_id);
create index if not exists push_contact_idx on push_subscriptions (contact_id);

-- ---------------------------------------------------------------- emergencies
create table if not exists emergency_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references users(id) on delete cascade,
  status           text not null default 'active' check (status in ('active','cancelled','resolved')),
  trigger_method   text not null,
  client_event_id  text,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  end_reason       text,
  start_lat        double precision,
  start_lng        double precision,
  start_accuracy   double precision,
  address          text,
  battery_level    double precision,
  is_demo          boolean not null default false,
  source_ref       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists emergencies_user_started_idx on emergency_events (user_id, started_at desc);
create index if not exists emergencies_active_idx on emergency_events (user_id) where status = 'active';
-- Idempotency: a client retrying the same SOS never creates a second event.
create unique index if not exists emergencies_client_event_uq on emergency_events (user_id, client_event_id) where client_event_id is not null;

create table if not exists emergency_locations (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references emergency_events(id) on delete cascade,
  lat            double precision not null check (lat between -90 and 90),
  lng            double precision not null check (lng between -180 and 180),
  accuracy       double precision,
  speed          double precision,
  heading        double precision,
  battery_level  double precision,
  recorded_at    timestamptz not null,
  created_at     timestamptz not null default now()
);
create index if not exists locations_event_time_idx on emergency_locations (event_id, recorded_at desc);

create table if not exists emergency_shares (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references emergency_events(id) on delete cascade,
  contact_id      uuid references trusted_contacts(id) on delete set null,
  token_hash      text not null unique,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  last_viewed_at  timestamptz,
  view_count      int not null default 0
);
create index if not exists shares_event_idx on emergency_shares (event_id);

-- ---------------------------------------------------------------- notifications
create table if not exists notifications (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  event_id             uuid references emergency_events(id) on delete cascade,
  check_in_id          uuid,
  journey_id           uuid,
  contact_id           uuid references trusted_contacts(id) on delete set null,
  channel              text not null check (channel in ('sms','email','push')),
  kind                 text not null,
  status               text not null default 'pending' check (status in ('pending','sent','failed','simulated','skipped')),
  provider             text,
  provider_message_id  text,
  recipient_masked     text not null default '',
  attempts             int not null default 0,
  last_error           text,
  next_attempt_at      timestamptz,
  created_at           timestamptz not null default now(),
  sent_at              timestamptz
);
create index if not exists notifications_event_idx on notifications (event_id);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_due_idx on notifications (next_attempt_at) where status in ('pending','failed');

-- ---------------------------------------------------------------- check-ins & journeys
create table if not exists check_ins (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  status            text not null default 'active' check (status in ('active','completed','escalated','cancelled')),
  started_at        timestamptz not null default now(),
  due_at            timestamptz not null,
  grace_minutes     int not null default 10 check (grace_minutes between 1 and 120),
  reminder_sent_at  timestamptz,
  escalated_at      timestamptz,
  completed_at      timestamptz,
  note              text,
  last_lat          double precision,
  last_lng          double precision,
  event_id          uuid references emergency_events(id) on delete set null
);
create index if not exists check_ins_user_idx on check_ins (user_id, started_at desc);
create index if not exists check_ins_due_idx on check_ins (due_at) where status = 'active';
create unique index if not exists check_ins_one_active on check_ins (user_id) where status = 'active';

create table if not exists safe_journeys (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references users(id) on delete cascade,
  status               text not null default 'active' check (status in ('active','completed','escalated','cancelled')),
  destination_label    text not null,
  dest_lat             double precision,
  dest_lng             double precision,
  start_lat            double precision,
  start_lng            double precision,
  started_at           timestamptz not null default now(),
  expected_arrival_at  timestamptz not null,
  grace_minutes        int not null default 15 check (grace_minutes between 1 and 180),
  contact_ids          jsonb not null default '[]'::jsonb,
  last_lat             double precision,
  last_lng             double precision,
  last_location_at     timestamptz,
  reminder_sent_at     timestamptz,
  completed_at         timestamptz,
  escalated_at         timestamptz,
  event_id             uuid references emergency_events(id) on delete set null
);
create index if not exists journeys_user_idx on safe_journeys (user_id, started_at desc);
create index if not exists journeys_due_idx on safe_journeys (expected_arrival_at) where status = 'active';
create unique index if not exists journeys_one_active on safe_journeys (user_id) where status = 'active';

-- ---------------------------------------------------------------- helplines (admin overrides)
create table if not exists emergency_numbers (
  id                  text primary key,
  country             text not null default 'IN',
  region              text not null,
  name                text not null,
  purpose             text not null,
  number              text not null check (number ~ '^[0-9+ -]{3,20}$'),
  category            text not null,
  availability_notes  text not null default '',
  priority            int not null default 100,
  active              boolean not null default true,
  updated_at          timestamptz not null default now()
);
create index if not exists emergency_numbers_region_idx on emergency_numbers (country, region);

-- ---------------------------------------------------------------- recordings
create table if not exists recordings (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  event_id          uuid references emergency_events(id) on delete set null,
  storage_key       text not null unique,
  mime_type         text not null,
  size_bytes        int not null,
  duration_seconds  double precision not null default 0,
  created_at        timestamptz not null default now()
);
create index if not exists recordings_user_idx on recordings (user_id, created_at desc);

-- ---------------------------------------------------------------- audit & rate limits
create table if not exists audit_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references users(id) on delete set null,
  actor        text not null check (actor in ('user','admin','system','contact')),
  action       text not null,
  target_type  text,
  target_id    text,
  ip_hash      text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_created_idx on audit_logs (created_at desc);
create index if not exists audit_user_idx on audit_logs (user_id, created_at desc);

create table if not exists rate_limits (
  key           text not null,
  window_start  bigint not null,
  count         int not null default 0,
  primary key (key, window_start)
);

-- ---------------------------------------------------------------- RLS: deny all client access
do $$
declare t text;
begin
  foreach t in array array[
    'users','sessions','auth_tokens','otp_codes','trusted_contacts','push_subscriptions',
    'emergency_events','emergency_locations','emergency_shares','notifications','check_ins',
    'safe_journeys','emergency_numbers','recordings','audit_logs','rate_limits'
  ] loop
    -- No policies are created: with RLS on, non-owner roles see zero rows.
    execute format('alter table %I enable row level security', t);
    begin
      execute format('revoke all on table %I from anon, authenticated', t);
    exception when undefined_object then
      null; -- plain PostgreSQL without Supabase roles
    end;
  end loop;
end $$;
