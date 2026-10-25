-- Tallyline schema. All timestamps are Unix milliseconds (UTC).

-- A website being tracked.
CREATE TABLE properties (
  id          TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  host        TEXT NOT NULL,              -- root domain, e.g. example.com (subdomains included)
  tz          TEXT NOT NULL DEFAULT 'UTC',
  currency    TEXT NOT NULL DEFAULT 'USD',
  secret_key  TEXT NOT NULL,              -- bearer key for the server-side API
  dodo_secret TEXT,                       -- Dodo Payments webhook signing secret (whsec_...)
  created     INTEGER NOT NULL
);

-- A browser with a Tallyline cookie. Name/email come from identify() or from a payment.
CREATE TABLE people (
  property_id  TEXT NOT NULL,
  uid          TEXT NOT NULL,
  first_at     INTEGER NOT NULL,
  ext_id       TEXT,
  display_name TEXT,
  email        TEXT,
  PRIMARY KEY (property_id, uid)
);
CREATE INDEX people_email ON people (property_id, email);

-- One visit. Ends after 30 idle minutes. Carries where the visit came from.
CREATE TABLE visits (
  property_id  TEXT NOT NULL,
  vsn          TEXT NOT NULL,
  uid          TEXT NOT NULL,
  began        INTEGER NOT NULL,
  last_active  INTEGER NOT NULL,
  engaged_ms   INTEGER NOT NULL DEFAULT 0,
  views        INTEGER NOT NULL DEFAULT 0,
  conversions  INTEGER NOT NULL DEFAULT 0,
  host_name    TEXT,
  landing      TEXT,
  last_path    TEXT,
  ref_url      TEXT,
  ref_host     TEXT,
  source       TEXT NOT NULL,
  channel      TEXT NOT NULL,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  utm_term     TEXT,
  utm_content  TEXT,
  tag          TEXT,                      -- ?ref= / ?via=
  country      TEXT,
  region       TEXT,
  city         TEXT,
  browser      TEXT,
  os           TEXT,
  device       TEXT,
  PRIMARY KEY (property_id, vsn)
);
CREATE INDEX visits_by_time ON visits (property_id, began);
CREATE INDEX visits_by_uid ON visits (property_id, uid);

-- Things that happened inside a visit: 'view', 'conversion' (goal), 'exit' (outbound click).
CREATE TABLE hits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id TEXT NOT NULL,
  vsn         TEXT NOT NULL,
  uid         TEXT NOT NULL,
  at          INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  label       TEXT,
  path        TEXT,
  meta        TEXT
);
CREATE INDEX hits_by_time ON hits (property_id, at);
CREATE INDEX hits_by_visit ON hits (property_id, vsn);
CREATE INDEX hits_by_uid ON hits (property_id, uid, at);

-- Money in (and out). Refunds are rows with kind = 'refund' and a negative amount.
CREATE TABLE charges (
  id               TEXT PRIMARY KEY,
  property_id      TEXT NOT NULL,
  gateway          TEXT NOT NULL,          -- 'dodo' or 'api'
  at               INTEGER NOT NULL,
  amount_minor     INTEGER NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'charge',
  currency         TEXT NOT NULL,
  uid              TEXT,
  vsn              TEXT,                   -- the visit credited with this charge
  customer_ref     TEXT,
  email            TEXT,
  display_name     TEXT,
  recurring        INTEGER NOT NULL DEFAULT 0,
  linked_via       TEXT,                   -- metadata | return_visit | prior_charge | email | timing
  subscription_ref TEXT
);
CREATE INDEX charges_by_time ON charges (property_id, at);
CREATE INDEX charges_by_customer ON charges (property_id, customer_ref);
CREATE INDEX charges_by_uid ON charges (property_id, uid);

-- Payment/subscription ids seen on the checkout return page (?payment_id=... / ?subscription_id=...).
CREATE TABLE checkout_returns (
  property_id TEXT NOT NULL,
  charge_ref  TEXT NOT NULL,
  uid         TEXT NOT NULL,
  at          INTEGER NOT NULL,
  PRIMARY KEY (property_id, charge_ref)
);

-- Saved funnels. steps_json = [{"kind":"page"|"goal","match":"/pricing"}, ...]
CREATE TABLE funnels (
  id          TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  title       TEXT NOT NULL,
  steps_json  TEXT NOT NULL,
  created     INTEGER NOT NULL
);

-- Wrong dashboard passwords, for lockout.
CREATE TABLE auth_attempts (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX auth_attempts_ip ON auth_attempts (ip, at);
