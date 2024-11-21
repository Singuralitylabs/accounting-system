-- タイムゾーンをJSTに設定
alter database postgres set timezone to 'Asia/Tokyo';

-- Functions for updating timestamps
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = timezone('Asia/Tokyo'::text, now());
    return new;
end;
$$ language plpgsql;