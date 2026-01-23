
-- update_availability_rpc.sql
-- Function to get room availability for a date range

CREATE OR REPLACE FUNCTION get_room_availability(p_start_date date, p_end_date date)
RETURNS TABLE(room_id uuid, min_available integer)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(p_start_date, p_end_date - INTERVAL '1 day', '1 day')::date AS d
    ),
    daily_availability AS (
        SELECT
            ri.room_id,
            ds.d AS date,
            -- Calculate availability for this day: capacity - reserved - sold
            -- If no inventory record exists, assume 0 availability (conservative)
            COALESCE(ri.capacity, 0) - COALESCE(ri.reserved, 0) - COALESCE(ri.sold, 0) AS available_quantity
        FROM date_series ds
        LEFT JOIN room_inventory ri ON ri.date = ds.d
        -- We want to consider ALL rooms that have ANY inventory in this range?
        -- No, we want to consider ALL rooms that exist? 
        -- Actually, the previous logic likely queried room_inventory directly.
        -- If we query room_inventory, we only get rooms that have inventory.
        WHERE ri.room_id IS NOT NULL
    )
    SELECT
        da.room_id,
        MIN(da.available_quantity)::integer AS min_available
    FROM daily_availability da
    GROUP BY da.room_id;
END;
$$;
