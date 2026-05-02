-- Run this in Supabase SQL Editor to add position column
alter table bank_accounts add column if not exists position integer default 0;

-- Set initial positions based on created_at order
update bank_accounts
set position = sub.rn
from (
  select id, row_number() over (order by created_at asc) as rn
  from bank_accounts
) sub
where bank_accounts.id = sub.id;
