/*
  # Add opcion_seleccionada column to rfqs

  1. Changes
    - Add `opcion_seleccionada` (uuid, nullable) to `rfqs` table
    - References the selected opcion for publication

  2. Notes
    - Used by BulkResultsPanel when publishing selected options
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rfqs' AND column_name = 'opcion_seleccionada'
  ) THEN
    ALTER TABLE rfqs ADD COLUMN opcion_seleccionada uuid;
  END IF;
END $$;
