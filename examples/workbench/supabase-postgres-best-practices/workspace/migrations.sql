-- migrations.sql: a sequence of ALTER TABLE statements that add foreign
-- keys to an existing schema. Each ALTER may or may not be followed by a
-- CREATE INDEX on the FK column.

-- =====================================================================
-- Migration 001: link orders to customers
-- =====================================================================
alter table orders
  add constraint orders_customer_id_fkey
  foreign key (customer_id) references customers(id) on delete restrict;

create index orders_customer_id_idx on orders (customer_id);


-- =====================================================================
-- Migration 002: link order_items to orders
-- =====================================================================
alter table order_items
  add constraint order_items_order_id_fkey
  foreign key (order_id) references orders(id) on delete cascade;

-- (no supporting index)


-- =====================================================================
-- Migration 003: link order_items to products
-- =====================================================================
alter table order_items
  add constraint order_items_product_id_fkey
  foreign key (product_id) references products(id) on delete restrict;

create index order_items_product_id_idx on order_items (product_id);


-- =====================================================================
-- Migration 004: link invoices to orders
-- =====================================================================
alter table invoices
  add constraint invoices_order_id_fkey
  foreign key (order_id) references orders(id) on delete restrict;

-- (no supporting index)


-- =====================================================================
-- Migration 005: link shipments to orders + carriers
-- =====================================================================
alter table shipments
  add constraint shipments_order_id_fkey
  foreign key (order_id) references orders(id) on delete cascade;

create index shipments_order_id_idx on shipments (order_id);

alter table shipments
  add constraint shipments_carrier_id_fkey
  foreign key (carrier_id) references carriers(id) on delete set null;

-- (no supporting index)


-- =====================================================================
-- Migration 006: link refunds to invoices
-- =====================================================================
alter table refunds
  add constraint refunds_invoice_id_fkey
  foreign key (invoice_id) references invoices(id) on delete restrict;

create index refunds_invoice_id_idx on refunds (invoice_id);


-- =====================================================================
-- Migration 007: link audit_log entries to users
-- =====================================================================
alter table audit_log
  add constraint audit_log_actor_id_fkey
  foreign key (actor_id) references users(id) on delete set null;

create index audit_log_actor_id_idx on audit_log (actor_id);
