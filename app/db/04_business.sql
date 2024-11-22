-- Drop existing table and its dependencies
drop table if exists business cascade;

-- Business table
create table business (
    id bigint primary key generated always as identity,
    name text not null,
    invoice_date date,
    period_date date,
    amount numeric(15,2),
    is_completed boolean default false not null,
    matter_id bigint references matters(id) on delete cascade not null,
    inserted_at timestamp with time zone default timezone('Asia/Tokyo'::text, now()) not null,
    updated_at timestamp with time zone default timezone('Asia/Tokyo'::text, now()) not null
);

comment on table business is 'ビジネスタスク情報を管理するテーブル';

-- Create index
create index business_matter_id_idx on business(matter_id);

-- Enable Row Level Security (RLS)
alter table business enable row level security;

-- Create policies
create policy "business_select_policy" on business
    for select 
    to authenticated
    using (
        exists (
            select 1 from matters
            join profiles on profiles.id = matters.user_id
            where matters.id = business.matter_id
            and profiles.user_id = auth.uid()::uuid
        ) OR
        exists (
            select 1 from profiles 
            where profiles.user_id = auth.uid()::uuid 
            and profiles.class in ('admin', 'accounting')
        )
    );

create policy "business_insert_policy" on business
    for insert 
    to authenticated
    with check (
        exists (
            select 1 from matters
            join profiles on profiles.id = matters.user_id
            where matters.id = business.matter_id
            and profiles.user_id = auth.uid()::uuid
        )
    );

create policy "business_update_policy" on business
    for update 
    to authenticated
    using (
        exists (
            select 1 from matters
            join profiles on profiles.id = matters.user_id
            where matters.id = business.matter_id
            and profiles.user_id = auth.uid()::uuid
        ) OR 
        exists (
            select 1 from profiles 
            where profiles.user_id = auth.uid()::uuid 
            and profiles.class in ('admin', 'accounting')
        )
    );

create policy "business_delete_policy" on business
    for delete 
    to authenticated
    using (
        exists (
            select 1 from matters
            join profiles on profiles.id = matters.user_id
            where matters.id = business.matter_id
            and profiles.user_id = auth.uid()::uuid
        ) OR 
        exists (
            select 1 from profiles 
            where profiles.user_id = auth.uid()::uuid 
            and profiles.class = 'admin'
        )
    );

-- Create trigger for updating timestamps
create trigger update_business_updated_at
    before update on business
    for each row
    execute procedure update_updated_at_column();