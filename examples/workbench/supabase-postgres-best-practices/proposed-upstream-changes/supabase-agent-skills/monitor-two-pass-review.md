---
title: Run Two Passes on Generated SQL Reviews
impact: MEDIUM
impactDescription: Catch absence-class bugs (missing WHERE, missing index) that single-pass review skips
tags: review, diagnostics, code-review, sql-review
---

## Run Two Passes on Generated SQL Reviews

Single-pass SQL review catches tokens that should not be there (presence violations) but
systematically misses required elements that are absent (absence violations). The most
dangerous SQL bugs — mutations without `WHERE`, tables without RLS, foreign keys without
indexes — all fall into the absence class and survive single-pass review undetected.

**Incorrect (single-pass review approves unsafe mutation):**

```sql
-- Single pass: scanned for SELECT *, OFFSET, subqueries — none found
-- Reviewer approves the following as safe:

update orders set status = 'archived';
-- Absence violation missed: no WHERE clause — this archives ALL rows, not just old ones
```

**Correct (two-pass review catches the absence violation):**

```sql
-- Pass 1 (presence): scan for known-bad tokens
--   SELECT *? No.  OFFSET? No.  auth.uid() direct? No.  IF NOT EXISTS on ALTER? No.
--   Passed.

-- Pass 2 (absence): verify required patterns exist on every mutation and user table
--   UPDATE/DELETE without WHERE? YES — absence violation caught

-- Fix: add WHERE clause before approving
update orders set status = 'archived'
  where created_at < now() - interval '1 year';
-- Now only rows older than one year are archived — safe and intentional
```

Pass 2 absence checklist — verify these exist:

```sql
-- UPDATE/DELETE must have a WHERE clause
update users set is_active = false where last_login < now() - interval '1 year';

-- User-data tables must have RLS enabled
alter table messages enable row level security;

-- FK columns must have a supporting index
create index posts_author_id_idx on posts (author_id);
```

Reference: [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
