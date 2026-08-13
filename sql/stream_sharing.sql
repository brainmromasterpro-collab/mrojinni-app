-- ============================================================================
-- COMPARTIR STREAMS — tablas + RLS (Supabase)
-- Correr en el SQL Editor de Supabase. Es idempotente (se puede correr varias veces).
--
-- Modelo:
--   team_emails      → correos del EQUIPO (acceso total a todo, ven todos los streams).
--   stream_members   → correos INVITADOS pre-autorizados a un stream específico.
--
-- Seguridad: RLS a nivel base de datos. El frontend usa el ANON key + la sesión del
-- usuario (JWT de Google con su email), así que auth.email() identifica al usuario.
-- El BACKEND usa el SERVICE_KEY, que IGNORA RLS → los workers siguen funcionando igual.
--
-- IMPORTANTE: probar con las queries del final ANTES de dar por bueno. Rollback al final.
-- ============================================================================

-- 1) EQUIPO (acceso total) ----------------------------------------------------
create table if not exists public.team_emails (
  email text primary key
);
insert into public.team_emails (email) values
  ('brain.mromasterpro@gmail.com'),
  ('thejinni.app@gmail.com')
on conflict (email) do nothing;

-- 2) MEMBRESÍAS DE STREAM (invitados) -----------------------------------------
create table if not exists public.stream_members (
  id         uuid primary key default gen_random_uuid(),
  stream_id  uuid not null references public.streams(id) on delete cascade,
  email      text not null,
  rol        text not null default 'miembro',   -- 'miembro' (interactúa) | 'lector'
  invited_by text,
  created_at timestamptz default now()
);
-- Unicidad case-insensitive por stream+correo: va como índice (una expresión no cabe en UNIQUE inline).
create unique index if not exists stream_members_stream_email_uidx on public.stream_members (stream_id, lower(email));
create index if not exists stream_members_email_idx on public.stream_members (lower(email));

-- 3) HELPERS (SECURITY DEFINER para poder leer team_emails/stream_members bajo RLS) ---
create or replace function public.is_team()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_emails t where lower(t.email) = lower(auth.email()));
$$;

create or replace function public.can_access_stream(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_team() or exists (
    select 1 from public.stream_members m
    where m.stream_id = sid and lower(m.email) = lower(auth.email())
  );
$$;

-- 4) RLS ----------------------------------------------------------------------
-- STREAMS: ver solo los accesibles; solo el equipo crea/edita/borra.
alter table public.streams enable row level security;
drop policy if exists "lectura publica streams"   on public.streams;
drop policy if exists "streams_select_acceso"      on public.streams;
drop policy if exists "streams_all_equipo"         on public.streams;
create policy "streams_select_acceso" on public.streams
  for select using ( public.can_access_stream(id) );
create policy "streams_all_equipo" on public.streams
  for all using ( public.is_team() ) with check ( public.is_team() );

-- MENSAJES: leer/insertar solo en streams accesibles.
alter table public.mensajes enable row level security;
drop policy if exists "lectura publica mensajes" on public.mensajes;
drop policy if exists "insert anon mensajes"     on public.mensajes;
drop policy if exists "mensajes_select_acceso"   on public.mensajes;
drop policy if exists "mensajes_insert_acceso"   on public.mensajes;
create policy "mensajes_select_acceso" on public.mensajes
  for select using ( public.can_access_stream(stream_id) );
create policy "mensajes_insert_acceso" on public.mensajes
  for insert with check ( public.can_access_stream(stream_id) );

-- STREAM_LOGS (panel derecho): leer solo de streams accesibles.
alter table public.stream_logs enable row level security;
drop policy if exists "stream_logs_select_acceso" on public.stream_logs;
create policy "stream_logs_select_acceso" on public.stream_logs
  for select using ( public.can_access_stream(stream_id) );

-- STREAM_MEMBERS: el equipo administra; el invitado ve su propia membresía.
alter table public.stream_members enable row level security;
drop policy if exists "members_select" on public.stream_members;
drop policy if exists "members_admin"  on public.stream_members;
create policy "members_select" on public.stream_members
  for select using ( public.is_team() or lower(email) = lower(auth.email()) );
create policy "members_admin" on public.stream_members
  for all using ( public.is_team() ) with check ( public.is_team() );

-- ============================================================================
-- PRUEBAS (correr como cada usuario para validar; en el SQL editor auth.email() es null,
-- así que valida mejor DESDE LA APP logueado). Comprobaciones rápidas de estructura:
--   select * from public.team_emails;
--   select * from public.stream_members;
--   select policyname, tablename from pg_policies where schemaname='public'
--     and tablename in ('streams','mensajes','stream_logs','stream_members');
--
-- ROLLBACK (si algo sale mal y hay que volver al estado permisivo):
--   alter table public.streams     disable row level security;
--   alter table public.mensajes    disable row level security;
--   alter table public.stream_logs disable row level security;
--   -- (y recrear las policies permisivas anteriores si las necesitas)
-- ============================================================================
