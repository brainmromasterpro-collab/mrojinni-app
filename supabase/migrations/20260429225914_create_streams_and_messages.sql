/*
  # Create streams and messages tables

  1. New Tables
    - `streams`
      - `id` (uuid, primary key)
      - `nombre` (text) - stream display name
      - `tipo` (text) - category: compras, ventas, logistica, general
      - `user_id` (uuid) - owner reference to auth.users
      - `created_at` (timestamptz) - creation timestamp
    - `messages`
      - `id` (uuid, primary key)
      - `stream_id` (uuid, foreign key to streams)
      - `rol` (text) - sender role: user, assistant, system
      - `tipo` (text) - message type: text, decision, widget
      - `contenido` (jsonb) - message content payload
      - `created_at` (timestamptz) - creation timestamp

  2. Security
    - Enable RLS on both tables
    - Users can only access their own streams
    - Users can only access messages in their own streams
*/

CREATE TABLE IF NOT EXISTS streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL DEFAULT '',
  tipo text NOT NULL DEFAULT 'general',
  user_id uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE streams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own streams"
  ON streams FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own streams"
  ON streams FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own streams"
  ON streams FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own streams"
  ON streams FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid NOT NULL REFERENCES streams(id) ON DELETE CASCADE,
  rol text NOT NULL DEFAULT 'user',
  tipo text NOT NULL DEFAULT 'text',
  contenido jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in own streams"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = messages.stream_id
      AND streams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in own streams"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = messages.stream_id
      AND streams.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete messages in own streams"
  ON messages FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM streams
      WHERE streams.id = messages.stream_id
      AND streams.user_id = auth.uid()
    )
  );
