CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  owner_id INT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_shares (
  document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  PRIMARY KEY (document_id, user_id)
);

INSERT INTO users (name, email) VALUES
  ('Alice', 'alice@ajaia.test'),
  ('Bob', 'bob@ajaia.test'),
  ('Carol', 'carol@ajaia.test')
ON CONFLICT (email) DO NOTHING;

-- Stretch features. ALTER ... IF NOT EXISTS so existing databases upgrade in place.
ALTER TABLE document_shares ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'editor'
  CHECK (role IN ('viewer', 'editor'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS updated_by INT REFERENCES users(id);

CREATE TABLE IF NOT EXISTS document_versions (
  id SERIAL PRIMARY KEY,
  document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_html TEXT NOT NULL,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  document_id INT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  quote TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
