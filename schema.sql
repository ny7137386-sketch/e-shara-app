CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('customer', 'seller', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('pending', 'assigned', 'shipped', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM ('requested', 'confirmed', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  email varchar(254) NOT NULL UNIQUE,
  phone varchar(30),
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name varchar(160) NOT NULL,
  description text,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  category varchar(30) NOT NULL CHECK (category IN ('Mitti', 'Bamboo', 'Silk', 'Waste')),
  image_url text,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  cart_id uuid NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cart_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delivery_partner_id uuid,
  status order_status NOT NULL DEFAULT 'pending',
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  shipping_address text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  PRIMARY KEY (order_id, product_id)
);

CREATE TABLE IF NOT EXISTS delivery_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(120) NOT NULL,
  phone varchar(30) NOT NULL,
  vehicle varchar(80),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_partner_id_fkey;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_partner_id_fkey
  FOREIGN KEY (delivery_partner_id) REFERENCES delivery_partners(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL UNIQUE,
  state varchar(100),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  name varchar(160) NOT NULL,
  address text NOT NULL,
  phone varchar(30),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES clinics(id) ON DELETE RESTRICT,
  appointment_date timestamptz NOT NULL,
  status appointment_status NOT NULL DEFAULT 'requested',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_category_idx ON products(category) WHERE is_active;
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS appointments_customer_idx ON appointments(customer_id, appointment_date);

INSERT INTO cities (name, state) VALUES
  ('Jaipur', 'Rajasthan'), ('Delhi', 'Delhi'), ('Lucknow', 'Uttar Pradesh'), ('Mumbai', 'Maharashtra')
ON CONFLICT (name) DO NOTHING;

INSERT INTO clinics (city_id, name, address, phone)
SELECT c.id, v.name, v.address, v.phone
FROM (VALUES
  ('Jaipur', 'Shanti Community Health Centre', 'Main Road', '1800-111-222'),
  ('Jaipur', 'Jeevan Jyoti Clinic', 'Civil Lines', '1800-111-223'),
  ('Delhi', 'Seva Medical Centre', 'Station Road', '1800-111-224'),
  ('Lucknow', 'Asha Family Clinic', 'Gandhi Nagar', '1800-111-225')
) AS v(city, name, address, phone)
JOIN cities c ON c.name = v.city
WHERE NOT EXISTS (SELECT 1 FROM clinics existing WHERE existing.name = v.name AND existing.city_id = c.id);

WITH maker AS (
  INSERT INTO users (name, email, password_hash, role)
  VALUES ('e shara catalogue', 'catalog@eshara.local', crypt(gen_random_uuid()::text, gen_salt('bf')), 'seller')
  ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
  RETURNING id
)
INSERT INTO products (seller_id, name, description, price, category, image_url, stock)
SELECT maker.id, item.name, item.description, item.price, item.category, item.image_url, 25
FROM maker
CROSS JOIN (VALUES
  ('Sunrise Mitti Pot Set', 'Hand-finished terracotta pots made by local makers.', 680.00, 'Mitti', 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=700&q=80'),
  ('Handwoven Bamboo Basket', 'A sturdy, useful basket woven by hand.', 1250.00, 'Bamboo', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=700&q=80'),
  ('Hand-painted Silk Dupatta', 'A bright silk dupatta with hand-painted details.', 890.00, 'Silk', 'https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=700&q=80'),
  ('Out-of-waste Gift Box', 'A thoughtful gift box made from useful reclaimed materials.', 540.00, 'Waste', 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=700&q=80')
) AS item(name, description, price, category, image_url)
WHERE NOT EXISTS (SELECT 1 FROM products existing WHERE existing.name = item.name);
