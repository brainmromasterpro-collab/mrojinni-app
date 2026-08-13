-- ============================================================================
-- IDENTIFICADOR DE AUTOR EN MENSAJES — para auditar qué hace cada invitado externo.
-- Correr en el SQL Editor de Supabase (idempotente).
--
-- Captura el correo del usuario AUTENTICADO en cada mensaje que inserta el FRONTEND
-- (sesión de Google → auth.email()). El BACKEND usa el SERVICE key → auth.email() es null,
-- así que los mensajes del agente quedan con autor_email null (solo importa el autor humano).
-- Es server-side: no se puede falsear desde el cliente.
-- ============================================================================

alter table public.mensajes add column if not exists autor_email text;

create or replace function public.set_mensaje_autor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.autor_email := auth.email();  -- null para el backend (service key)
  return new;
end $$;

drop trigger if exists trg_mensaje_autor on public.mensajes;
create trigger trg_mensaje_autor
  before insert on public.mensajes
  for each row execute function public.set_mensaje_autor();

-- Verificar:
--   select autor_email, role, left(content,40), created_at
--   from public.mensajes order by created_at desc limit 20;
