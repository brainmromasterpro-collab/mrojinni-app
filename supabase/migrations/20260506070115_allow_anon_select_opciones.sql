/*
  # Allow anon to read opciones

  1. Security Changes
    - Add SELECT policy on `opciones` table for anon role
    - Restricts access to opciones whose rfq_id references an rfq with a non-null stream_id

  2. Notes
    - RLS was enabled but no policies existed, blocking all client reads
    - This policy enables the polling mechanism in the frontend to retrieve search results
*/

CREATE POLICY "Allow anon to select opciones"
  ON opciones
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM rfqs
      WHERE rfqs.id = opciones.rfq_id
      AND rfqs.stream_id IS NOT NULL
    )
  );
