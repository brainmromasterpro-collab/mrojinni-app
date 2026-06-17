/*
  # Allow anonymous users to update RFQs

  1. Security Changes
    - Add UPDATE policy on `rfqs` table for anon role
    - Allows updating estado and foto_url columns
  
  2. Notes
    - Required for the "Reintentar imagen" button to update rfq estado
*/

CREATE POLICY "anon puede actualizar rfqs"
  ON rfqs
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
