-- ============================================================================
-- ACTIVAR RLS en streams, mensajes y stream_logs  (Supabase Security Advisor: 6 errores)
-- ============================================================================
-- Estado actual: las políticas existen (de stream_sharing.sql) pero RLS está APAGADO en estas 3 tablas, así que las
-- políticas no se aplican y cualquiera con la llave anon (que va en el frontend) puede leer y escribir mensajes,
-- streams y logs. Alguien corrió el ROLLBACK de stream_sharing.sql en algún momento.
--
-- Es seguro para el backend: usa la llave service_role (verificado), que ignora RLS. Los workers no se ven afectados.
-- El frontend (llave anon + sesión de Google) pasa por las políticas:
--   · equipo (team_emails)  → ve y escribe todo
--   · invitado (stream_members) → solo SUS streams
--
-- CAMBIO respecto a stream_sharing.sql: el frontend también ESCRIBE en stream_logs (pushLog en App.tsx), pero solo
-- había política de lectura → al activar RLS esas líneas del log de actividad dejarían de guardarse. Se agrega
-- la política de INSERT.
--
-- Corre TODO esto en Supabase > SQL editor. Es idempotente (se puede correr más de una vez).
-- ============================================================================

-- STREAMS
alter table public.streams enable row level security;
drop policy if exists "lectura publica streams"  on public.streams;
drop policy if exists "streams_select_acceso"    on public.streams;
drop policy if exists "streams_all_equipo"       on public.streams;
create policy "streams_select_acceso" on public.streams
  for select using ( public.can_access_stream(id) );
create policy "streams_all_equipo" on public.streams
  for all using ( public.is_team() ) with check ( public.is_team() );

-- MENSAJES
alter table public.mensajes enable row level security;
drop policy if exists "lectura publica mensajes" on public.mensajes;
drop policy if exists "insert anon mensajes"     on public.mensajes;
drop policy if exists "mensajes_select_acceso"   on public.mensajes;
drop policy if exists "mensajes_insert_acceso"   on public.mensajes;
create policy "mensajes_select_acceso" on public.mensajes
  for select using ( public.can_access_stream(stream_id) );
create policy "mensajes_insert_acceso" on public.mensajes
  for insert with check ( public.can_access_stream(stream_id) );

-- STREAM_LOGS (leer + que el frontend pueda escribir sus líneas de actividad)
alter table public.stream_logs enable row level security;
drop policy if exists "stream_logs_select_acceso" on public.stream_logs;
drop policy if exists "stream_logs_insert_acceso" on public.stream_logs;
create policy "stream_logs_select_acceso" on public.stream_logs
  for select using ( public.can_access_stream(stream_id) );
create policy "stream_logs_insert_acceso" on public.stream_logs
  for insert with check ( public.can_access_stream(stream_id) );

-- VERIFICACIÓN: las 3 tablas deben salir con rowsecurity = true
-- select tablename, rowsecurity from pg_tables
--  where schemaname = 'public' and tablename in ('streams', 'mensajes', 'stream_logs', 'stream_members');

-- ROLLBACK (solo si algo falla y hay que volver a lo permisivo; vuelve a abrir el agujero):
--   alter table public.streams     disable row level security;
--   alter table public.mensajes    disable row level security;
--   alter table public.stream_logs disable row level security;
