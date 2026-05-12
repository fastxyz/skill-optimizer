-- data_migration.sql: one-shot backfill script. Wrap in a transaction
-- so we can review all DML before committing. Each statement targets a
-- specific subset of rows.

begin;

-- 1. Backfill missing display names from email local-part.
update users
  set display_name = split_part(email, '@', 1)
  where display_name is null;


-- 2. Mark stale draft posts as archived.
update posts
  set status = 'archived',
      archived_at = now()
  where status = 'draft'
    and updated_at < now() - interval '180 days';


-- 3. Recompute order totals after pricing rule fix.
update orders
  set total = subtotal + tax + shipping;


-- 4. Delete orphaned cart items left over from the v1 checkout flow.
delete from cart_items
  where cart_id not in (select id from carts);


-- 5. Set notification_preference default for legacy users.
update users
  set notification_preference = 'daily'
  where notification_preference is null
    and created_at < '2024-01-01';


-- 6. Remove expired email verification tokens.
delete from email_verification_tokens
  where expires_at < now();

commit;
