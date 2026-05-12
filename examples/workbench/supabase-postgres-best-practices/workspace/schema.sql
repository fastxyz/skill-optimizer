-- schema.sql: E-commerce schema with intentional best-practice violations
-- for supabase-postgres-best-practices eval

-- Customers table (clean reference)
CREATE TABLE customers (
  id bigint generated always as identity primary key,
  email text not null,
  deleted_at timestamptz
);

-- Orders table
-- VIOLATION (schema-foreign-key-indexes): customer_id FK column has no index
CREATE TABLE orders (
  id bigint generated always as identity primary key,
  customer_id bigint references customers(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz default now(),
  total numeric(10,2)
);

-- VIOLATION (schema-constraints): ADD CONSTRAINT IF NOT EXISTS is invalid Postgres syntax
ALTER TABLE orders
  ADD CONSTRAINT IF NOT EXISTS orders_amount_valid CHECK (total > 0);

-- VIOLATION (query-partial-indexes): full index on email instead of partial (ignores deleted_at)
CREATE INDEX customers_email_idx ON customers (email);

-- VIOLATION (query-composite-indexes): range column before equality column breaks leftmost-prefix rule
CREATE INDEX orders_date_status_idx ON orders (created_at, status);

-- VIOLATION (security-rls-basics): orders table stores user data but has no RLS enabled
-- The application filters by user_id in SQL but database enforces no tenant isolation.
-- Missing: ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
