-- Run in Supabase SQL Editor

create table if not exists others_funds (
  id uuid primary key default uuid_generate_v4(),
  date date not null default current_date,
  investor_balance_start numeric(20,6) not null default 0,  -- رصيد البداية الخاص للمستثمرين
  share_ratio numeric(20,10) not null default 0,            -- عدد الاسهم / النسبة
  current_profit numeric(20,6) not null default 0,          -- الربح الحال
  capital numeric(20,6) not null default 0,                 -- اصل المال
  additional_funds numeric(20,6) not null default 0,        -- اموال اضافية
  notes text,
  created_at timestamptz default now()
);

alter table others_funds disable row level security;
