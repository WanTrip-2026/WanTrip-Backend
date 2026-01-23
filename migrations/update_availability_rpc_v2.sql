
-- update_availability_rpc_v2.sql
-- Function to get room availability for a date range, FILTERED by hotel_id

DROP FUNCTION IF EXISTS get_room_availability(date, date);

CREATE OR REPLACE FUNCTION get_room_availability(p_hotel_id uuid, p_start_date date, p_end_date date)
RETURNS TABLE(room_id uuid, min_available integer)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(p_start_date, p_end_date - INTERVAL '1 day', '1 day')::date AS d
    ),
    target_rooms AS (
        SELECT id FROM rooms WHERE hotel_id = p_hotel_id
    ),
    daily_availability AS (
        SELECT
            ri.room_id,
            ds.d AS date,
            COALESCE(ri.capacity, 0) - COALESCE(ri.reserved, 0) - COALESCE(ri.sold, 0) AS available_quantity
        FROM date_series ds
        CROSS JOIN target_rooms tr
        LEFT JOIN room_inventory ri ON ri.date = ds.d AND ri.room_id = tr.id
    )
    SELECT
        da.room_id,
        MIN(COALESCE(da.available_quantity, 0))::integer AS min_available
    FROM daily_availability da
    GROUP BY da.room_id;
END;
$$;
