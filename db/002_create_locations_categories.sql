-- Locations, categories (Revenue Channels filter) and sub categories (the lines inside a category).
-- Target: database gyro_toast_pipeline, schema public.

-- keeps modified_at current whenever a row is changed
CREATE OR REPLACE FUNCTION public.set_modified_at() RETURNS trigger AS $$
BEGIN
  NEW.modified_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

/* ---------- locations ---------- */
CREATE TABLE IF NOT EXISTS public.locations (
  location_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name  text        NOT NULL,
  is_open        boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  modified_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS locations_name_lower_uq ON public.locations (lower(location_name));

/* ---------- categories: added in the admin panel, shown as the filter on the Revenue Channels tab (e.g. In-Store, Delivery, Catering) ---------- */
CREATE TABLE IF NOT EXISTS public.categories (
  category_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name  text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  modified_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_id_name_uq UNIQUE (category_id, category_name)   -- lets sub categories point at both the id and the name
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_lower_uq ON public.categories (lower(category_name));

/* ---------- sub categories: the line names that sit under one category (e.g. Take Out and Delivery under Off-Premise) ---------- */
CREATE TABLE IF NOT EXISTS public.sub_categories (
  sub_category_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id        uuid        NOT NULL,
  category_name      text        NOT NULL,      -- the category it comes under; follows a rename of the category automatically
  sub_category_name  text        NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  modified_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sub_categories_category_fk FOREIGN KEY (category_id, category_name)
    REFERENCES public.categories (category_id, category_name) ON UPDATE CASCADE ON DELETE CASCADE
);
-- a line name appears once inside a category, ignoring upper/lower case
CREATE UNIQUE INDEX IF NOT EXISTS sub_categories_name_uq ON public.sub_categories (category_id, lower(sub_category_name));

/* ---------- modified_at triggers ---------- */
DROP TRIGGER IF EXISTS locations_modified ON public.locations;
CREATE TRIGGER locations_modified BEFORE UPDATE ON public.locations FOR EACH ROW EXECUTE FUNCTION public.set_modified_at();
DROP TRIGGER IF EXISTS categories_modified ON public.categories;
CREATE TRIGGER categories_modified BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_modified_at();
DROP TRIGGER IF EXISTS sub_categories_modified ON public.sub_categories;
CREATE TRIGGER sub_categories_modified BEFORE UPDATE ON public.sub_categories FOR EACH ROW EXECUTE FUNCTION public.set_modified_at();
