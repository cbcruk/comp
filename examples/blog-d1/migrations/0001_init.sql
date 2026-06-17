CREATE TABLE posts (
  id integer PRIMARY KEY AUTOINCREMENT,
  title text NOT NULL,
  slug text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'draft',
  created_at integer NOT NULL
);

CREATE TABLE passkey_challenges (
  user_id text PRIMARY KEY,
  challenge text NOT NULL
);

CREATE TABLE passkey_credentials (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  public_key text NOT NULL,
  counter integer NOT NULL DEFAULT 0,
  transports text
);

CREATE INDEX passkey_credentials_user_id ON passkey_credentials (user_id);
