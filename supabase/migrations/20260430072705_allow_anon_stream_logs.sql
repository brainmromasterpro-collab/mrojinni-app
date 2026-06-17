/*
  # Allow anonymous access to stream_logs for demo mode

  1. Changes
    - Add SELECT policy for anon role on stream_logs
    - Add INSERT policy for anon role on stream_logs
    - Remove foreign key constraint on stream_id to allow demo stream IDs
  2. Notes
    - This enables the live logs feature to work before auth is implemented
    - The stream_id column keeps NOT NULL but drops FK constraint for flexibility
*/

-- Drop existing FK constraint to allow demo stream IDs
ALTER TABLE stream_logs DROP CONSTRAINT IF EXISTS stream_logs_stream_id_fkey;

-- Allow anon to read logs
CREATE POLICY "Anon can view stream logs"
  ON stream_logs
  FOR SELECT
  TO anon
  USING (true);

-- Allow anon to insert logs
CREATE POLICY "Anon can insert stream logs"
  ON stream_logs
  FOR INSERT
  TO anon
  WITH CHECK (true);