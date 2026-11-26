-- REGISTRO ESTRUCTURADO DE EVENTOS DE NEGOCIO (2026-11-26)
-- Qué es: un libro de eventos (solo se agrega, no se edita) con lo que cambia dinero o inventario en 1CRM: PO creado/deshecho,
--   pago registrado/deshecho, recepción confirmada/deshecha y estado de cada recepción. El backend lo escribe EN PARALELO a los
--   mensajes del chat y lo lee junto con ellos; si esta tabla no existe, todo sigue funcionando como hasta ahora (con los
--   mensajes). Con la tabla, saldos de pagos, POs vigentes y recepciones dejan de depender de que no se borre el chat.
-- Cómo correrlo: Supabase → SQL Editor → pegar y ejecutar. Es idempotente (se puede correr dos veces).
-- Seguridad: RLS activado SIN políticas → el frontend (anon/authenticated) no puede leerla ni escribirla; el backend usa la
--   llave de servicio (service_role), que no pasa por RLS.

create table if not exists public.eventos_negocio (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  stream_id     text,
  tipo          text not null,   -- po_creado | po_deshecho | pago_registrado | pago_deshecho | recepcion_confirmada | recepcion_deshecha | receiving_estado
  clave         text unique,     -- idempotencia: un mismo evento (p. ej. "pago:<payment_id>") no se registra dos veces
  po_id         text,
  bill_id       text,
  so_id         text,
  registro_id   text,            -- Bill/Invoice al que se aplicó un pago
  payment_id    text,
  recepcion_id  text,            -- identifica UNA entrega; el «deshacer» la referencia para restarla
  monto         numeric,
  moneda        text,
  datos         jsonb not null default '{}'::jsonb
);

create index if not exists eventos_negocio_tipo_idx      on public.eventos_negocio (tipo, created_at);
create index if not exists eventos_negocio_po_idx        on public.eventos_negocio (po_id);
create index if not exists eventos_negocio_payment_idx   on public.eventos_negocio (payment_id);
create index if not exists eventos_negocio_stream_idx    on public.eventos_negocio (stream_id);

alter table public.eventos_negocio enable row level security;
-- (sin políticas a propósito: solo service_role)
