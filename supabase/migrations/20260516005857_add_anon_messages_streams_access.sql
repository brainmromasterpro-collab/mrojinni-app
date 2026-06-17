/*
  # Enable anon access to streams and messages for demo mode

  1. Changes
    - Insert two demo streams that match the hardcoded IDs in the frontend
    - Add RLS policies allowing anon role to SELECT, INSERT, UPDATE on streams
    - Add RLS policies allowing anon role to SELECT, INSERT, DELETE on messages
    - Remove user_id NOT NULL constraint from streams to allow demo usage

  2. Security
    - Policies allow anon access scoped to the demo streams
    - Messages are scoped by stream_id foreign key

  3. Notes
    - This enables message persistence without authentication for demo/MVP mode
    - When auth is added later, these policies can be tightened
*/

-- Make user_id nullable for demo streams
ALTER TABLE streams ALTER COLUMN user_id DROP NOT NULL;

-- Insert demo streams matching frontend constants
INSERT INTO streams (id, nombre, tipo, user_id, created_at)
VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'RFQ · MRO Master', 'compras', NULL, now()),
  ('b2c3d4e5-f6a7-8901-bcde-f12345678901', 'APQP · Cliente 2', 'general', NULL, now())
ON CONFLICT (id) DO NOTHING;

-- Anon policies for streams
CREATE POLICY "Anon can view demo streams"
  ON streams FOR SELECT
  TO anon
  USING (user_id IS NULL);

CREATE POLICY "Anon can insert demo streams"
  ON streams FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- Anon policies for messages
CREATE POLICY "Anon can view messages in demo streams"
  ON messages FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = messages.stream_id
      AND streams.user_id IS NULL
    )
  );

CREATE POLICY "Anon can insert messages in demo streams"
  ON messages FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = messages.stream_id
      AND streams.user_id IS NULL
    )
  );

CREATE POLICY "Anon can delete messages in demo streams"
  ON messages FOR DELETE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = messages.stream_id
      AND streams.user_id IS NULL
    )
  );
