
-- Set the search path to the correct schema
SET search_path TO migration_data;

-- Count the total number of individual_local_identifier's
SELECT individual_local_identifier, COUNT(*) as count
    FROM stork_data
    GROUP BY individual_local_identifier
    ORDER BY count DESC;

SELECT COUNT(*) FROM migration_data.stork_data;

-- Check the number of records in the entitre table
SET search_path TO migration_data;

    SELECT
  COUNT(individual_local_identifier) AS individual_local_identifier,
  COUNT(tag_local_identifier) AS tag_local_identifier,
  COUNT(timestamp) AS timestamp,
  COUNT(location_lat) AS location_lat,
  COUNT(location_long) AS location_long,
  COUNT(flt_switch) AS flt_switch,
  COUNT(new_flt_switch) AS new_flt_switch,
  COUNT(heading) AS heading,
  COUNT(location_lat_5dp) AS lat_5dec,
  COUNT(location_long_5dp) AS long_5dec,
  COUNT(location_lat_3dp) AS lat_3dec,
  COUNT(location_long_3dp) AS long_3dec,
  COUNT(compass_direction) AS compass_direction,
  COUNT(calculated_heading) AS calculated_heading,
  COUNT(distance) AS distance
FROM migration_data.stork_data;

-- Check the number of records in the columns transferred from the datasets
SELECT
  COUNT(individual_local_identifier) AS individual_local_identifier_count,
  COUNT(tag_local_identifier) AS tag_local_identifier_count,
  COUNT(timestamp) AS timestamp_count,
  COUNT(location_lat) AS location_lat_count,
  COUNT(location_long) AS location_long_count,
  COUNT(flt_switch) AS flt_switch_count,
  COUNT(new_flt_switch) AS new_flt_switch_count,
  COUNT(heading) AS heading_count
FROM migration_data.stork_data;

-- Remove the NULL setting from a table column
ALTER TABLE migration_data.stork_data
ALTER COLUMN calculated_heading DROP NOT NULL;

-- Confirm a column is nullable or not
SELECT 
    column_name, 
    is_nullable 
FROM 
    information_schema.columns
WHERE 
    table_schema = 'migration_data' 
    AND table_name = 'stork_data'
    AND column_name = 'calculated_heading';


FROM migration_data.stork_data
GROUP BY individual_local_identifier
ORDER BY record_count DESC;

-- select * from migration_data.stork_data
-- Where individual_local_identifier = '392 David Coultard_Adult';

SET search_path TO migration_data, public;
DROP TABLE IF EXISTS migration_data.stork_data;


-- Check if any columns have NaN values
SET search_path TO migration_data;

SELECT
  COUNT(*) - COUNT(individual_local_identifier) AS individual_local_identifier_nulls,
  COUNT(*) - COUNT(tag_local_identifier) AS tag_local_identifier_nulls,
  COUNT(*) - COUNT(timestamp) AS timestamp_nulls,
  COUNT(*) - COUNT(location_lat) AS location_lat_nulls,
  COUNT(*) - COUNT(location_long) AS location_long_nulls,
  COUNT(*) - COUNT(flt_switch) AS flt_switch_nulls,
  COUNT(*) - COUNT(new_flt_switch) AS new_flt_switch_nulls,
  COUNT(*) - COUNT(heading) AS heading_nulls,
  COUNT(*) - COUNT(location_lat_5dp) AS lat_5dec_nulls,
  COUNT(*) - COUNT(location_long_5dp) AS long_5dec_nulls,
  COUNT(*) - COUNT(location_lat_3dp) AS lat_3dec_nulls,
  COUNT(*) - COUNT(location_long_3dp) AS long_3dec_nulls,
  COUNT(*) - COUNT(compass_direction) AS compass_direction_nulls,
  COUNT(*) - COUNT(calculated_heading) AS calculated_heading_nulls,
  COUNT(*) - COUNT(distance) AS distance_nulls,
  COUNT(*) - COUNT(sql_heading) AS sql_heading_nulls,
  COUNT(*) - COUNT(sql_distance) AS sql_distance_nulls
FROM migration_data.stork_data;

--################################################################################################################
-- Check the distance and calculated heading records are correct (specifically the 0 distance and 0 heading results)
SET search_path TO migration_data;

WITH movement_pairs AS (
  SELECT
    record_id,
    individual_local_identifier,
    timestamp,
    location_lat AS lat1,
    location_long AS lon1,
    LEAD(location_lat) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS lat2,
    LEAD(location_long) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS lon2,
    calculated_heading,
    distance
  FROM stork_data
)

SELECT
  record_id,
  individual_local_identifier,
  timestamp,
  lat1,
  lon1,
  lat2,
  lon2,

  -- Calculate distance (Haversine formula)
  6371000 * 2 * ASIN(
    SQRT(
      POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) +
      COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
      POWER(SIN(RADIANS(lon2 - lon1) / 2), 2)
    )
  ) AS temp_distance,

  -- Calculate heading with explicit casts to numeric for mod
  MOD( 
    CAST(DEGREES(ATAN2(
      SIN(RADIANS(lon2 - lon1)) * COS(RADIANS(lat2)),
      COS(RADIANS(lat1)) * SIN(RADIANS(lat2)) -
      SIN(RADIANS(lat1)) * COS(RADIANS(lat2)) * COS(RADIANS(lon2 - lon1))
    )) + 360 AS numeric),
    360
  ) AS temp_heading,

  -- Existing values
  distance AS existing_distance,
  calculated_heading AS existing_heading

FROM movement_pairs
WHERE lat1 IS NOT NULL AND lon1 IS NOT NULL
  AND lat2 IS NOT NULL AND lon2 IS NOT NULL;


-- ##################################################################################################################
-- Check the distance and calculated heading records are correct (specifically the 0 distance and 0 heading results)
WITH movement_pairs AS (
  SELECT
    record_id,
    location_lat AS lat1,
    location_long AS lon1,
    LEAD(location_lat) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS lat2,
    LEAD(location_long) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS lon2,
    distance AS original_distance,
    calculated_heading AS original_heading
  FROM migration_data.stork_data
),
computed AS (
  SELECT *,
    -- Haversine distance
    6371000 * 2 * ASIN(
      SQRT(
        POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) +
        COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
        POWER(SIN(RADIANS(lon2 - lon1) / 2), 2)
      )
    ) AS new_distance,

    -- Heading calculation
    MOD(
      CAST(DEGREES(ATAN2(
        SIN(RADIANS(lon2 - lon1)) * COS(RADIANS(lat2)),
        COS(RADIANS(lat1)) * SIN(RADIANS(lat2)) -
        SIN(RADIANS(lat1)) * COS(RADIANS(lat2)) * COS(RADIANS(lon2 - lon1))
      )) + 360 AS numeric),
      360
    ) AS new_heading

  FROM movement_pairs
  WHERE lat1 IS NOT NULL AND lon1 IS NOT NULL AND lat2 IS NOT NULL AND lon2 IS NOT NULL
)

SELECT
  COUNT(*) FILTER (WHERE original_distance = 0 AND original_heading = 0) AS original_both_zero,
  COUNT(*) FILTER (WHERE ROUND(new_distance::numeric, 2) = 0 AND ROUND(new_heading::numeric, 2) = 0) AS new_both_zero
FROM computed;


-- ############################################################################################################
-- Recalculates heading and distance on the fly, Compares them to the original values, Counts how many times both are zero in each case
WITH recalculated AS (
  SELECT
    record_id,
    location_lat_5dp,
    location_long_5dp,
    calculated_heading AS original_heading,
    distance AS original_distance,
    LEAD(location_lat_5dp) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_lat,
    LEAD(location_long_5dp) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_long
  FROM migration_data.stork_data
),
computed AS (
  SELECT *,
    -- Calculate new heading (mod 360 using FLOOR)
    CASE
      WHEN next_lat IS NOT NULL AND next_long IS NOT NULL THEN
        (
          DEGREES(ATAN2(
            SIN(RADIANS(next_long - location_long_5dp)) * COS(RADIANS(next_lat)),
            COS(RADIANS(location_lat_5dp)) * SIN(RADIANS(next_lat)) -
            SIN(RADIANS(location_lat_5dp)) * COS(RADIANS(next_lat)) * COS(RADIANS(next_long - location_long_5dp))
          )) + 360
        ) - FLOOR( (
          DEGREES(ATAN2(
            SIN(RADIANS(next_long - location_long_5dp)) * COS(RADIANS(next_lat)),
            COS(RADIANS(location_lat_5dp)) * SIN(RADIANS(next_lat)) -
            SIN(RADIANS(location_lat_5dp)) * COS(RADIANS(next_lat)) * COS(RADIANS(next_long - location_long_5dp))
          )) + 360
        ) / 360 ) * 360
      ELSE NULL
    END AS new_heading,

    -- Calculate new distance using Haversine formula
    CASE
      WHEN next_lat IS NOT NULL AND next_long IS NOT NULL THEN
        6371000 * 2 * 
        ASIN(
          SQRT(
            POWER(SIN(RADIANS((next_lat - location_lat_5dp) / 2)), 2) +
            COS(RADIANS(location_lat_5dp)) * COS(RADIANS(next_lat)) *
            POWER(SIN(RADIANS((next_long - location_long_5dp) / 2)), 2)
          )
        )
      ELSE NULL
    END AS new_distance
  FROM recalculated
)
SELECT
  COUNT(*) FILTER (WHERE original_distance = 0 AND original_heading = 0) AS original_both_zero,
  COUNT(*) FILTER (
    WHERE ROUND(new_distance::numeric, 2) = 0 AND ROUND(new_heading::numeric, 2) = 0
  ) AS new_both_zero
FROM computed;



-- Step 2: Populate sql_heading and sql_distance Using SQL
WITH computed AS (
  SELECT 
    record_id,
    location_lat AS lat1,
    location_long AS lon1,
    LEAD(location_lat) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS lat2,
    LEAD(location_long) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS lon2
  FROM migration_data.stork_data
)
UPDATE migration_data.stork_data AS s
SET 
  sql_heading = (
    SELECT
      MOD((
        DEGREES(ATAN2(
          SIN(RADIANS(c.lon2 - c.lon1)) * COS(RADIANS(c.lat2)),
          COS(RADIANS(c.lat1)) * SIN(RADIANS(c.lat2)) -
          SIN(RADIANS(c.lat1)) * COS(RADIANS(c.lat2)) * COS(RADIANS(c.lon2 - c.lon1))
        )) + 360
      )::NUMERIC, 360)::DOUBLE PRECISION
    FROM computed c
    WHERE s.record_id = c.record_id AND c.lat2 IS NOT NULL AND c.lon2 IS NOT NULL
  ),
  sql_distance = (
    SELECT
      6371000 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS((c.lat2 - c.lat1) / 2)), 2) +
        COS(RADIANS(c.lat1)) * COS(RADIANS(c.lat2)) *
        POWER(SIN(RADIANS((c.lon2 - c.lon1) / 2)), 2)
      ))
    FROM computed c
    WHERE s.record_id = c.record_id AND c.lat2 IS NOT NULL AND c.lon2 IS NOT NULL
  );

-- check the updated values for those two birds:
SELECT individual_local_identifier, record_id, timestamp, sql_heading, sql_distance
FROM migration_data.stork_data
WHERE individual_local_identifier IN ('266 Aldina 2018 deployment', '310 Marie Curie')
ORDER BY individual_local_identifier, timestamp
LIMIT 20;

-- Check pairs of records to confirm the calcs are correct
WITH ordered_points AS (
  SELECT
    individual_local_identifier,
    record_id,
    timestamp,
    location_lat,
    location_long,
    sql_heading,
    sql_distance,
    LEAD(location_lat) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_lat,
    LEAD(location_long) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_long,
    LEAD(sql_heading) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_heading,
    LEAD(sql_distance) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_distance
  FROM migration_data.stork_data
  WHERE individual_local_identifier IN ('266 Aldina 2018 deployment', '310 Marie Curie')
)
SELECT *
FROM ordered_points
WHERE next_lat IS NOT NULL
ORDER BY individual_local_identifier, timestamp
LIMIT 10;

-- check how many records have zero values for both sql_heading and sql_distance, and how many records in total for those birds
SELECT 
  individual_local_identifier,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE sql_heading = 0 AND sql_distance = 0) AS zero_heading_distance_count
FROM migration_data.stork_data
WHERE individual_local_identifier IN ('266 Aldina 2018 deployment', '310 Marie Curie')
GROUP BY individual_local_identifier;

-- test new query to fetch only the sample rate and de-duplication results initially to reduce memory and processing time.
WITH deduped AS (
  SELECT *,
         date_trunc('hour', timestamp) +
         INTERVAL '1 minute' * (FLOOR(EXTRACT(MINUTE FROM timestamp) / 5) * 5) AS rounded_timestamp,
         ROW_NUMBER() OVER (
             PARTITION BY individual_local_identifier,
                          date_trunc('hour', timestamp) +
                          INTERVAL '1 minute' * (FLOOR(EXTRACT(MINUTE FROM timestamp) / 5) * 5)
             ORDER BY timestamp
         ) AS rn
  FROM migration_data.stork_data
  WHERE sql_distance IS NOT NULL
    AND sql_heading IS NOT NULL
),
filtered AS (
  SELECT *
  FROM deduped
  WHERE rn = 1
)
SELECT *
FROM filtered
WHERE MOD(record_id, 50) = 0;  -- Sample every 50th record

