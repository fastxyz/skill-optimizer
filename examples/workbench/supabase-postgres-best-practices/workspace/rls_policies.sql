-- rls_policies.sql: Row-Level Security setup with intentional best-practice violations
-- for supabase-postgres-best-practices eval

-- === RLS enabled, but FORCE not applied ===
-- VIOLATION (security-rls-basics): table owner can bypass RLS; FORCE not set
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
-- FIX: also run ALTER TABLE orders FORCE ROW LEVEL SECURITY;

-- === Policy with per-row function call ===
-- VIOLATION (security-rls-performance): auth.uid() called per row, not wrapped in SELECT
CREATE POLICY orders_user_policy ON orders
  FOR ALL
  USING (user_id = auth.uid());
-- FIX: USING ((select auth.uid()) = user_id)

-- === RLS policy column has no index ===
-- VIOLATION (security-rls-performance): user_id used in RLS USING clause has no index
-- Every request triggers a sequential scan on orders for the authenticated user.
-- FIX: CREATE INDEX orders_user_id_idx ON orders (user_id);

-- === Covering index missing INCLUDE ===
-- VIOLATION (query-covering-indexes): status index does not cover fetched columns
CREATE INDEX orders_status_idx ON orders (status);
-- Query: SELECT status, customer_id, total FROM orders WHERE status = 'shipped'
-- FIX: CREATE INDEX orders_status_idx ON orders (status) INCLUDE (customer_id, total);
