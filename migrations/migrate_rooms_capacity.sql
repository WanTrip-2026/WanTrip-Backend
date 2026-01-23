-- migrate_rooms_capacity.sql
-- Purpose: standardize rooms capacity field name to guest_capacity
-- and ensure basic constraints.

BEGIN;

-- 1) Ensure guest_capacity exists (for environments that still have `capacity`)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'rooms'
      AND column_name  = 'guest_capacity'
  ) THEN
    -- If old capacity exists, rename it; otherwise add new column.
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'rooms'
        AND column_name  = 'capacity'
    ) THEN
      ALTER TABLE public.rooms RENAME COLUMN capacity TO guest_capacity;
    ELSE
      ALTER TABLE public.rooms ADD COLUMN guest_capacity integer;
    END IF;
  END IF;
END $$;

-- 2) Optional: add a sanity check (allow NULL, but if not NULL must be >= 0)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_guest_capacity_check'
  ) THEN
    ALTER TABLE public.rooms
    ADD CONSTRAINT rooms_guest_capacity_check
    CHECK (guest_capacity IS NULL OR guest_capacity >= 0);
  END IF;
END $$;

COMMIT;
