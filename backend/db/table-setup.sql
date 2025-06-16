-- Full Database, Schema, and Table Setup
CREATE DATABASE stork_migration_data;

CREATE SCHEMA IF NOT EXISTS migration_data;

SET search_path to migration_data,public;
DROP TABLE IF EXISTS migration_data.stork_data;

CREATE TABLE migration_data.stork_data (
    record_id SERIAL PRIMARY KEY,
    individual_local_identifier TEXT NOT NULL,
    tag_local_identifier BIGINT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    location_lat FLOAT NOT NULL,
    location_long FLOAT NOT NULL,
    flt_switch SMALLINT NOT NULL,
    heading FLOAT NOT NULL,
    new_flt_switch INTEGER NOT NULL,
    location_lat_5dp NUMERIC(9,5),
    location_long_5dp NUMERIC(9,5),
    location_lat_3dp NUMERIC(7,3),
    location_long_3dp NUMERIC(7,3),
    calculated_heading FLOAT,
    compass_direction VARCHAR(15),
    distance DOUBLE PRECISION
);

-- Step 1: Add New Columns to stork_data
ALTER TABLE migration_data.stork_data
ADD COLUMN IF NOT EXISTS sql_heading DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS sql_distance DOUBLE PRECISION;


--  directly compare your newly calculated sql_heading and sql_distance columns 
-- against the original calculated_heading and distance columns
SELECT 
  individual_local_identifier,
  COUNT(*) AS total_records,

  COUNT(*) FILTER (WHERE sql_heading = 0 AND sql_distance = 0) AS zero_sql_values,
  COUNT(*) FILTER (WHERE calculated_heading = 0 AND distance = 0) AS zero_original_values,

  COUNT(*) FILTER (
    WHERE 
      sql_heading = calculated_heading AND 
      sql_distance = distance
  ) AS exact_matches,

  COUNT(*) FILTER (
    WHERE 
      sql_heading IS DISTINCT FROM calculated_heading OR 
      sql_distance IS DISTINCT FROM distance
  ) AS mismatches

FROM migration_data.stork_data
WHERE individual_local_identifier IN ('266 Aldina 2018 deployment', '310 Marie Curie')
GROUP BY individual_local_identifier;

-- sample a handful of rows where the new sql_* values differ from the original ones
WITH ordered_points AS (
  SELECT
    individual_local_identifier,
    record_id,
    timestamp,
    location_lat,
    location_long,
    calculated_heading,
    distance,
    sql_heading,
    sql_distance,
    LEAD(location_lat) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_lat,
    LEAD(location_long) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_long,
    LEAD(calculated_heading) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_calculated_heading,
    LEAD(distance) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_distance,
    LEAD(sql_heading) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_sql_heading,
    LEAD(sql_distance) OVER (PARTITION BY individual_local_identifier ORDER BY timestamp) AS next_sql_distance
  FROM migration_data.stork_data
  WHERE individual_local_identifier IN ('266 Aldina 2018 deployment', '310 Marie Curie')
)
SELECT *
FROM ordered_points
WHERE next_lat IS NOT NULL
  AND (
    sql_heading <> calculated_heading
    OR sql_distance <> distance
    OR next_sql_heading <> next_calculated_heading
    OR next_sql_distance <> next_distance
  )
ORDER BY individual_local_identifier, timestamp
LIMIT 10;


