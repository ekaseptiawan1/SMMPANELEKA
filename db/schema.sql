CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS services (
  id BIGSERIAL PRIMARY KEY,
  supplier_service_id TEXT,
  platform TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  supplier_rate BIGINT NOT NULL DEFAULT 0 CHECK (supplier_rate >= 0),
  rate BIGINT NOT NULL DEFAULT 0 CHECK (rate >= 0),
  min_qty INTEGER NOT NULL DEFAULT 100,
  max_qty INTEGER NOT NULL DEFAULT 100000,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Upgrade existing installations as well as fresh databases.
ALTER TABLE services ADD COLUMN IF NOT EXISTS supplier_rate BIGINT NOT NULL DEFAULT 0 CHECK (supplier_rate >= 0);
UPDATE services SET supplier_rate = rate WHERE supplier_rate = 0;

CREATE TABLE IF NOT EXISTS deposits (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','expired')),
  payment_ref TEXT UNIQUE,
  payment_url TEXT,
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer',
  proof_reference TEXT,
  admin_note TEXT,
  provider_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  service_id BIGINT NOT NULL REFERENCES services(id),
  target TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  charge BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  supplier_order_id TEXT,
  start_count BIGINT,
  remains BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('deposit','order','refund','adjustment')),
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  reference TEXT,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id BIGINT REFERENCES users(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_user ON wallet_transactions(user_id, created_at DESC);

-- A supplier service may appear only once in the local catalog.
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_supplier_service_id_unique ON services(supplier_service_id) WHERE supplier_service_id IS NOT NULL;

ALTER TABLE deposits ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'bank_transfer';
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS proof_reference TEXT;
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS admin_note TEXT;
