-- Run in Supabase SQL Editor
-- Adds source_tx_id to track which general transactions have been imported into a month

alter table manager_month_transactions
  add column if not exists source_tx_id uuid references manager_transactions(id) on delete set null;
