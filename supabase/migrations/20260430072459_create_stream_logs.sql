/*
  # Create stream_logs table for live activity logs

  1. New Tables
    - `stream_logs`
      - `id` (uuid, primary key)
      - `stream_id` (uuid, foreign key to streams with CASCADE delete)
      - `msg` (text) - log message
      - `type` (text) - log type: 'ok', 'warn', 'error'
      - `created_at` (timestamptz)
  2. Security
    - Enable RLS on `stream_logs` table
    - Add policies for users to manage logs in their own streams
  3. Notes
    - Realtime enabled for live log streaming
*/

CREATE TABLE IF NOT EXISTS stream_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  msg text NOT NULL DEFAULT '',
  type text NOT NULL DEFAULT 'ok',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stream_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view logs in own streams"
  ON stream_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = stream_logs.stream_id
      AND streams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert logs in own streams"
  ON stream_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = stream_logs.stream_id
      AND streams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete logs in own streams"
  ON stream_logs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = stream_logs.stream_id
      AND streams.user_id = auth.uid()
    )
  );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE stream_logs;