-- =============================================
-- RESET: Drop all tables and recreate
-- Run this in Supabase SQL Editor
-- =============================================

-- Drop tables if exist (order matters for dependencies)
drop table if exists bank_accounts cascade;
drop table if exists categories cascade;
drop table if exists settings cascade;
drop table if exists debts cascade;
drop table if exists investors cascade;
drop table if exists creditors cascade;

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- bank_accounts
create table bank_accounts (
  id uuid primary key default uuid_generate_v4(),
  client_name text not null,
  bank_name text not null,
  account_number text not null,
  iban text,
  phone text,
  balance numeric(15,2) not null default 0,
  created_at timestamptz default now()
);

-- categories
create table categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  pieces_count numeric(15,2) not null default 0,
  created_at timestamptz default now()
);

-- settings
create table settings (
  id uuid primary key default uuid_generate_v4(),
  key text unique not null,
  value text not null,
  created_at timestamptz default now()
);

insert into settings (key, value) values ('unified_price', '50');

-- debts
create table debts (
  id uuid primary key default uuid_generate_v4(),
  debtor_name text not null,
  amount numeric(15,2) not null default 0,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- investors
create table investors (
  id uuid primary key default uuid_generate_v4(),
  investor_name text not null,
  amount numeric(15,2) not null default 0,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- creditors
create table creditors (
  id uuid primary key default uuid_generate_v4(),
  creditor_name text not null,
  amount numeric(15,2) not null default 0,
  date date not null default current_date,
  created_at timestamptz default now()
);

-- Disable RLS (no auth required)
alter table bank_accounts disable row level security;
alter table categories disable row level security;
alter table settings disable row level security;
alter table debts disable row level security;
alter table investors disable row level security;
alter table creditors disable row level security;
