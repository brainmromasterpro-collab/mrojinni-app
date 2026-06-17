/*
  # Create RFQs table

  1. New Tables
    - `rfqs`
      - `id` (uuid, primary key)
      - `stream_id` (uuid, FK to streams)
      - `rfq_id` (text, unique, format RFQ-YYYY-MMDD-NNN)
      - `marca` (text, not null)
      - `modelo` (text, not null)
      - `qty` (integer, not null, default 1)
      - `urgente` (boolean, default false)
      - `estado` (text, default 'recibido')
      - `contacto_nombre` (text)
      - `contacto_email` (text)
      - `contacto_empresa` (text)
      - `contacto_phone` (text)
      - `contacto_direccion` (text)
      - `datos_extra` (jsonb, default '{}')
      - `created_at` (timestamptz, default now())
      - `updated_at` (timestamptz, default now())

  2. Security
    - Enable RLS on `rfqs` table
    - Add policy for anon users to insert and select (development phase)
*/

CREATE TABLE IF NOT EXISTS rfqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_id uuid REFERENCES streams(id),
  rfq_id text UNIQUE NOT NULL,
  marca text NOT NULL,
  modelo text NOT NULL,
  qty integer NOT NULL DEFAULT 1,
  urgente boolean DEFAULT false,
  estado text DEFAULT 'recibido',
  contacto_nombre text,
  contacto_email text,
  contacto_empresa text,
  contacto_phone text,
  contacto_direccion text,
  datos_extra jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE rfqs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon to insert rfqs"
  ON rfqs
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon to select rfqs"
  ON rfqs
  FOR SELECT
  TO anon
  USING (stream_id IS NOT NULL);