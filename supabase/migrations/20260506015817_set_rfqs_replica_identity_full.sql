/*
  # Set rfqs replica identity to FULL

  1. Changes
    - Sets replica identity to FULL on the `rfqs` table
    - This ensures that UPDATE events sent via realtime include the complete row data
      (including the `estado` column) in the payload, not just the primary key

  2. Important Notes
    - Required for the frontend to read `payload.new.estado` in the realtime subscription
    - Without FULL, only the primary key columns are guaranteed in the payload
*/

ALTER TABLE rfqs REPLICA IDENTITY FULL;
