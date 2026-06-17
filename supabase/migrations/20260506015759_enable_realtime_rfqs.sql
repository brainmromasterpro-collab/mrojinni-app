/*
  # Enable realtime for rfqs table

  1. Changes
    - Adds `rfqs` table to the `supabase_realtime` publication
    - This allows frontend subscriptions via `postgres_changes` to receive UPDATE events
      when the `estado` column changes (e.g., when the buscador agent completes its search)

  2. Important Notes
    - Required for the realtime subscription in the RFQ flow to work
    - Only UPDATE events on `rfqs` are subscribed to in the app
*/

ALTER PUBLICATION supabase_realtime ADD TABLE rfqs;
