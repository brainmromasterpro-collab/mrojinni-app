/*
  # Allow anon select on notificaciones

  1. Security
    - Add SELECT policy for anon role on notificaciones table
    - Required for dashboard to display recent activity
*/

CREATE POLICY "anon puede leer notificaciones"
  ON notificaciones
  FOR SELECT
  TO anon
  USING (true);
