-- Contrato de streams en la base de datos: la tabla rfqs mezcla dos procesos, y cada uno solo puede vivir en SU stream.
--   · RFQ de búsqueda (rfq_id 'RFQ-...')       → streams busquedas, catalogo, generico
--   · Publicación desde link (rfq_id 'LINK-...') → streams publicacion, catalogo, generico
-- Un RFQ sin stream (stream_id NULL) sigue permitido. No modifica filas existentes: solo valida INSERT y cambios de
-- stream_id nuevos. Espejo de stream_contracts.py (backend) y src/lib/streamContracts.ts (frontend).
-- Corre esto en Supabase > SQL editor.

CREATE OR REPLACE FUNCTION rfqs_validar_stream_contrato() RETURNS trigger AS $$
DECLARE
  t text;
  v_busqueda    text[] := ARRAY['busquedas', 'catalogo', 'generico'];
  v_publicacion text[] := ARRAY['publicacion', 'catalogo', 'generico'];
  permitidos    text[];
BEGIN
  IF NEW.stream_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT tipo INTO t FROM streams WHERE id = NEW.stream_id;
  IF COALESCE(NEW.rfq_id, '') LIKE 'LINK-%' THEN
    permitidos := v_publicacion;
  ELSE
    permitidos := v_busqueda;
  END IF;
  IF t IS NULL OR NOT (t = ANY (permitidos)) THEN
    RAISE EXCEPTION 'El RFQ % no puede pertenecer a un stream tipo % (stream %)', NEW.rfq_id, t, NEW.stream_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;  -- lee streams sin depender de RLS del que inserta

DROP TRIGGER IF EXISTS rfqs_stream_contrato ON rfqs;
CREATE TRIGGER rfqs_stream_contrato
  BEFORE INSERT OR UPDATE OF stream_id ON rfqs
  FOR EACH ROW EXECUTE FUNCTION rfqs_validar_stream_contrato();
