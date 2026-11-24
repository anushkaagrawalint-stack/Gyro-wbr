-- Dining options (the raw Toast names) and the sub category each one belongs to. One sub category can hold many dining options.
-- Target: database gyro_toast_pipeline, schema public.

-- lets dining_options point at both the id and the name of a sub category (adds a constraint only; no data or columns change)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_categories_id_name_uq') THEN
    ALTER TABLE public.sub_categories ADD CONSTRAINT sub_categories_id_name_uq UNIQUE (sub_category_id, sub_category_name);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.dining_options (
  dining_option_id    uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  dining_option_name  text  NOT NULL,
  sub_category_id     uuid  NOT NULL,
  sub_category_name   text  NOT NULL,      -- the sub category it sits under; follows a rename automatically
  CONSTRAINT dining_options_sub_category_fk FOREIGN KEY (sub_category_id, sub_category_name)
    REFERENCES public.sub_categories (sub_category_id, sub_category_name) ON UPDATE CASCADE ON DELETE CASCADE
);
-- a dining option belongs to one sub category only. Exact spelling: Toast treats "Dine In GUID" and "Dine In Guid" as different options
CREATE UNIQUE INDEX IF NOT EXISTS dining_options_name_uq ON public.dining_options (dining_option_name);
