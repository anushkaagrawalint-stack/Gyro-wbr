-- Users table for the WBR dashboard login and admin panel.
-- Target: database gyro_toast_pipeline, schema public.
--
-- access levels (match the app's roles):
--   admin          -> everything, including the Admin panel            (app role "admin")
--   owner          -> everything except the Admin panel               (app role "client")
--   store_manager  -> location view for the locations in "location"   (app role "location")
--
-- Passwords are never stored as plain text: the app saves a salted scrypt hash (salt + hash), as it does today.

CREATE TABLE IF NOT EXISTS public.users (
  u_id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name      text        NOT NULL,
  user_email     text        NOT NULL,
  password_salt  text        NOT NULL,
  password_hash  text        NOT NULL,
  location       text[]      NOT NULL DEFAULT '{}',        -- only used for store_manager: the stores they may see
  access         text        NOT NULL CHECK (access IN ('admin', 'owner', 'store_manager')),
  last_update    timestamptz NOT NULL DEFAULT now(),
  user_created   timestamptz NOT NULL DEFAULT now(),
  last_login     timestamptz,                              -- null until the first sign-in
  CONSTRAINT store_manager_has_location CHECK (access <> 'store_manager' OR cardinality(location) > 0)
);

-- one account per email, ignoring upper/lower case
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON public.users (lower(user_email));

-- keep last_update current whenever a row is changed
CREATE OR REPLACE FUNCTION public.users_touch_last_update() RETURNS trigger AS $$
BEGIN
  NEW.last_update := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch_last_update ON public.users;
CREATE TRIGGER users_touch_last_update BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_touch_last_update();
