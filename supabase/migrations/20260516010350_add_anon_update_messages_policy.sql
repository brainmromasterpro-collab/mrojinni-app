/*
  # Allow anon to update messages in demo streams

  1. Changes
    - Add UPDATE policy for anon role on messages table
    - Required for upsert operations (ON CONFLICT DO UPDATE)

  2. Security
    - Scoped to messages in demo streams (user_id IS NULL)
*/

CREATE POLICY "Anon can update messages in demo streams"
  ON messages FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = messages.stream_id
      AND streams.user_id IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = messages.stream_id
      AND streams.user_id IS NULL
    )
  );
