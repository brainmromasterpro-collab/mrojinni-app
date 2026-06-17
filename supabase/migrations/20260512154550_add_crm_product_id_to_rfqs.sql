/*
  # Add crm_product_id column to rfqs

  1. Modified Tables
    - `rfqs`
      - Added `crm_product_id` (text, nullable) - stores the product ID from the external CRM system

  2. Notes
    - Column is nullable since not all RFQs will have a linked CRM product initially
*/

ALTER TABLE rfqs ADD COLUMN IF NOT EXISTS crm_product_id TEXT;