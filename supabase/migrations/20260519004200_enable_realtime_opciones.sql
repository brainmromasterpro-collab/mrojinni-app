/*
  # Enable Realtime on opciones table

  1. Changes
    - Add `opciones` table to the `supabase_realtime` publication
    - This allows the BulkResultsPanel to receive real-time notifications
      when new supplier options are inserted for bulk RFQs

  2. Why
    - Without this, the bulk results panel never gets notified when search
      results arrive, causing it to appear stuck with no progress
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'opciones'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE opciones;
  END IF;
END $$;
