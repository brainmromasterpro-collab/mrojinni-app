/*
  # Add attachments column to rfqs table

  1. Modified Tables
    - `rfqs`
      - Added `attachments` (jsonb, default '[]') - stores array of file metadata objects
        Each object: {name, type, size, storage_path, url}

  2. Notes
    - Allows RFQs to have associated file uploads (Word, Excel, PDF, images, audio)
    - Files are stored in Supabase Storage; metadata references stored here
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rfqs' AND column_name = 'attachments'
  ) THEN
    ALTER TABLE rfqs ADD COLUMN attachments jsonb DEFAULT '[]';
  END IF;
END $$;
