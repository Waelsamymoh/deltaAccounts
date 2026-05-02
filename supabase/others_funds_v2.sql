-- Run in Supabase SQL Editor
-- Adds new columns and removes old ones from others_funds

alter table others_funds
  add column if not exists manager_capital        numeric(20,6) not null default 0,
  add column if not exists manager_additional_funds numeric(20,6) not null default 0,
  add column if not exists manager_balance_start  numeric(20,6) not null default 0;

alter table others_funds
  drop column if exists capital,
  drop column if exists additional_funds;
