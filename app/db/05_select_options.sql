-- 情報カテゴリのenum型を作成
create type information_category as enum (
    'basic_info',     -- 基本情報
    'business_info',  -- 取引先情報
    'cost_info'       -- コスト情報
);

-- 選択肢の種類を管理するテーブル
create table select_option_types (
    id uuid primary key default gen_random_uuid(),
    name varchar not null unique,
    display_name varchar not null,
    category information_category not null,
    description text,
    display_order integer default 0,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 選択肢の値を管理するテーブル
create table select_options (
    id serial primary key,
    type_id uuid references select_option_types(id) on delete cascade,
    value varchar not null,
    display_order integer default 0,
    is_active boolean default true,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(type_id, value)
);

-- RLSを有効化
alter table select_option_types enable row level security;
alter table select_options enable row level security;

-- 読み取りポリシー: 全ユーザーが読み取り可能
create policy "Users can view select option types" on select_option_types
    for select using (true);

create policy "Users can view select options" on select_options
    for select using (true);

-- 書き込みポリシー: admin権限のユーザーのみ書き込み可能
create policy "Admin can update any select options" on select_option_types
    for all using (
        exists (
            select 1 from profiles
            where profiles.user_id = auth.uid()::uuid
            and profiles.class = 'admin'
        )
    );

create policy "Admin can insert any select options" on select_options
    for all using (
        exists (
            select 1 from profiles
            where profiles.user_id = auth.uid()::uuid
            and profiles.class = 'admin'
        )
    );

-- 初期データの投入
insert into select_option_types (name, display_name, category, display_order) values
    ('team', 'チーム', 'basic_info', 1),
    ('category', '分類', 'basic_info', 2),
    ('item', '品目', 'cost_info', 1),
    ('certificate', '通知方法', 'cost_info', 2);

-- チーム選択肢
insert into select_options (type_id, value, display_order) values
    ((select id from select_option_types where name = 'team'), 'シンラボ', 1),
    ((select id from select_option_types where name = 'team'), 'SDGs', 2),
    ((select id from select_option_types where name = 'team'), '広報', 3),
    ((select id from select_option_types where name = 'team'), 'AI事業創出', 4),
    ((select id from select_option_types where name = 'team'), 'ハロスク', 5),
    ((select id from select_option_types where name = 'team'), '事務局', 6);

-- 案件分類選択肢
insert into select_options (type_id, value, display_order) values
    ((select id from select_option_types where name = 'category'), '会員費', 1),
    ((select id from select_option_types where name = 'category'), '受託案件', 2),
    ((select id from select_option_types where name = 'category'), '認定ファシリ', 3),
    ((select id from select_option_types where name = 'category'), '研修・検定', 4),
    ((select id from select_option_types where name = 'category'), 'ボードゲーム', 5),
    ((select id from select_option_types where name = 'category'), 'イベント', 6),
    ((select id from select_option_types where name = 'category'), 'ハロスク', 7),
    ((select id from select_option_types where name = 'category'), 'その他', 8);

-- 費目選択肢
insert into select_options (type_id, value, display_order) values
    ((select id from select_option_types where name = 'item'), 'システム料', 1),
    ((select id from select_option_types where name = 'item'), '施設利用料', 2),
    ((select id from select_option_types where name = 'item'), '外注費', 3),
    ((select id from select_option_types where name = 'item'), '備品購入', 4),
    ((select id from select_option_types where name = 'item'), 'メンバー報酬', 5),
    ((select id from select_option_types where name = 'item'), 'シンラボ活動費', 6),
    ((select id from select_option_types where name = 'item'), '広告宣伝費', 7),
    ((select id from select_option_types where name = 'item'), '教育・研修', 8),
    ((select id from select_option_types where name = 'item'), '営業費', 9),
    ((select id from select_option_types where name = 'item'), 'その他', 10);

-- 証憑選択肢
insert into select_options (type_id, value, display_order) values
    ((select id from select_option_types where name = 'certificate'), '請求書', 1),
    ((select id from select_option_types where name = 'certificate'), '領収書', 2);
