-- Drop existing table and its dependencies
drop table if exists matters cascade;

-- Matters table
create table matters (
    id bigint primary key generated always as identity,
    title text not null,
    category text not null,
    team text not null,
    description text,
    start_date date,
    is_fixed boolean default false,
    is_completed boolean default false,
    total_cost numeric(15,2) default 0,
    cost_count integer default 0,
    total_amount numeric(15,2) default 0,
    business_count integer default 0,
    accounting_memo text,
    unchecked_cost_count integer default 0 not null,
    user_id bigint references profiles(id) on delete cascade not null,
    inserted_at timestamp with time zone default timezone('Asia/Tokyo'::text, now()) not null,
    updated_at timestamp with time zone default timezone('Asia/Tokyo'::text, now()) not null
);

comment on table matters is '案件情報を管理するテーブル';

-- Create index
create index matters_user_id_idx on matters(user_id);

-- Enable Row Level Security (RLS)
alter table matters enable row level security;

-- Create policies
create policy "matters_select_policy" on matters
    for select 
    to authenticated
    using (
        exists (
            select 1 from profiles
            where profiles.id = matters.user_id
            and profiles.user_id = auth.uid()::text
        ) OR
        exists (
            select 1 from profiles 
            where profiles.user_id = auth.uid()::text 
            and profiles.class in ('admin', 'accounting')
        )
    );

create policy "matters_insert_policy" on matters
    for insert 
    to authenticated
    with check (
        exists (
            select 1 from profiles
            where profiles.id = matters.user_id
            and profiles.user_id = auth.uid()::text
        )
    );

create policy "matters_update_policy" on matters
    for update 
    to authenticated
    using (
        exists (
            select 1 from profiles
            where profiles.id = matters.user_id
            and profiles.user_id = auth.uid()::text
        ) OR 
        exists (
            select 1 from profiles 
            where profiles.user_id = auth.uid()::text 
            and profiles.class = 'admin'
        )
    );

create policy "matters_delete_policy" on matters
    for delete 
    to authenticated
    using (
        exists (
            select 1 from profiles
            where profiles.id = matters.user_id
            and profiles.user_id = auth.uid()::text
        ) OR 
        exists (
            select 1 from profiles 
            where profiles.user_id = auth.uid()::text 
            and profiles.class = 'admin'
        )
    );

-- Create trigger for updating timestamps
create trigger update_matters_updated_at
    before update on matters
    for each row
    execute procedure update_updated_at_column();