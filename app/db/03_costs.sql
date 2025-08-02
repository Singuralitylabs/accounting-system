-- Drop existing table and its dependencies
drop table if exists costs cascade;

-- Costs table
create table costs (
    id bigint primary key generated always as identity,
    name text not null,
    item text not null,
    payment_target text not null,
    price numeric(15,2) not null,
    period date,
    certificate text not null,
    withholding boolean default false not null,
    is_completed boolean default false not null,
    comment text,
    matter_id bigint references matters(id) on delete cascade not null,
    inserted_at timestamp with time zone default timezone('Asia/Tokyo'::text, now()) not null,
    updated_at timestamp with time zone default timezone('Asia/Tokyo'::text, now()) not null
);

comment on table costs is 'コスト情報を管理するテーブル';

-- Create index
create index costs_matter_id_idx on costs(matter_id);

-- Enable Row Level Security (RLS)
alter table costs enable row level security;

-- Create policies
create policy "costs_select_policy" on costs
    for select 
    to authenticated
    using (
        exists (
            select 1 from matters
            join profiles on profiles.id = matters.user_id
            where matters.id = costs.matter_id
            and profiles.user_id = auth.uid()::uuid
        ) OR
        exists (
            select 1 from profiles 
            where profiles.user_id = auth.uid()::uuid
            and profiles.class in ('admin', 'accounting')
        ) OR
        exists (
            select 1 from matters
            join profiles on profiles.user_id = auth.uid()::uuid
            where matters.id = costs.matter_id
            and profiles.class = 'teamleader'
            and profiles.team is not null
            and profiles.team = matters.team
        )
    );

create policy "costs_insert_policy" on costs
    for insert 
    to authenticated
    with check (
        exists (
            select 1 from matters
            join profiles on profiles.id = matters.user_id
            where matters.id = costs.matter_id
            and profiles.user_id = auth.uid()::uuid
        )
    );

create policy "costs_update_policy" on costs
    for update 
    to authenticated
    using (
        exists (
            select 1 from matters
            join profiles on profiles.id = matters.user_id
            where matters.id = costs.matter_id
            and profiles.user_id = auth.uid()::uuid
        ) OR 
        exists (
            select 1 from profiles 
            where profiles.user_id = auth.uid()::uuid 
            and profiles.class in ('admin', 'accounting')
        )
    );

create policy "costs_delete_policy" on costs
    for delete 
    to authenticated
    using (
        exists (
            select 1 from matters
            join profiles on profiles.id = matters.user_id
            where matters.id = costs.matter_id
            and profiles.user_id = auth.uid()::uuid
        ) OR 
        exists (
            select 1 from profiles 
            where profiles.user_id = auth.uid()::uuid
            and profiles.class = 'admin'
        )
    );

-- Create trigger for updating timestamps
create trigger update_costs_updated_at
    before update on costs
    for each row
    execute procedure update_updated_at_column();