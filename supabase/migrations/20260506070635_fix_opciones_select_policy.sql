/*
  # Fix opciones SELECT policy

  1. Security Changes
    - Drop existing overly restrictive policy that required rfqs.stream_id IS NOT NULL
    - Create new policy allowing anon to read opciones for any rfq that exists
    
  2. Notes
    - The previous policy blocked reads when rfqs.stream_id was null
    - Since some RFQs are created with null stream_id (demo streams not in DB), 
      the polling was always returning empty results
*/

DROP POLICY IF EXISTS "Allow anon to select opciones" ON opciones;

CREATE POLICY "Allow anon to select opciones"
  ON opciones
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM rfqs
      WHERE rfqs.id = opciones.rfq_id
    )
  );
