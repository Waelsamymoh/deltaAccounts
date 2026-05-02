-- =============================================
-- Delta Accounts - Supabase Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================
-- bank_accounts (الحسابات البنكية)
-- =============================================
create table if not exists bank_accounts (
  id uuid primary key default uuid_generate_v4(),
  client_name text not null,
  bank_name text not null,
  account_number text not null,
  iban text,
  phone text,
  balance numeric(15,2) not null default 0,
  created_at timestamptz default now()
);

-- =============================================
-- categories (الأصناف)
-- =============================================
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  pieces_count numeric(15,2) not null default 0,
  created_at timestamptz default now()
);

-- =============================================
-- settings (الإعدادات - السعر الموحد)
-- =============================================
create table if not exists settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value text not null,
  created_at timestamptz default now()
);

-- Insert default unified price
insert into settings (key, value)
values ('unified_price', '50')
on conflict (key) do nothing;

-- =============================================
-- debts (المديونية)
-- =============================================
create table if not exists debts (
  id uuid primary key default uuid_generate_v4(),
  debtor_name text not null,
  amount numeric(15,2) not null default 0,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- =============================================
-- investors (المستثمرون - أصل المال)
-- =============================================
create table if not exists investors (
  id uuid primary key default uuid_generate_v4(),
  investor_name text not null,
  amount numeric(15,2) not null default 0,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- =============================================
-- creditors (الدائنون)
-- =============================================
create table if not exists creditors (
  id uuid primary key default uuid_generate_v4(),
  creditor_name text not null,
  amount numeric(15,2) not null default 0,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- =============================================
-- RLS: Disable completely (no auth needed)
-- =============================================
alter table bank_accounts disable row level security;
alter table categories disable row level security;
alter table settings disable row level security;
alter table debts disable row level security;
alter table investors disable row level security;
alter table creditors disable row level security;

-- Drop old policies if they exist
drop policy if exists "Allow all on bank_accounts" on bank_accounts;
drop policy if exists "Allow all on categories" on categories;
drop policy if exists "Allow all on settings" on settings;
drop policy if exists "Allow all on debts" on debts;
drop policy if exists "Allow all on investors" on investors;
drop policy if exists "Allow all on creditors" on creditors;
