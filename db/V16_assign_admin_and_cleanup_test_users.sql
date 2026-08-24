-- V16: optional first administrator bootstrap.
--
-- Do not commit a real person's email address to a migration. Environments
-- that need a first administrator can set the transaction-local PostgreSQL
-- setting before running this migration:
--   select set_config('app.bootstrap_admin_email', 'admin@example.com', true);

do $$
declare
    bootstrap_admin_email text := lower(
        nullif(current_setting('app.bootstrap_admin_email', true), '')
    );
begin
    if bootstrap_admin_email is null then
        raise notice 'app.bootstrap_admin_email is not set; skipping admin bootstrap';
        return;
    end if;

    update public.players
    set role = 'admin',
        status = 'active'
    where lower(email) = bootstrap_admin_email;

    if not found then
        raise notice 'bootstrap administrator does not match an existing player';
    end if;
end
$$;
