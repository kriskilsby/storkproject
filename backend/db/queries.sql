
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
  COUNT(*) - COUNT(distance) AS distance_nulls
FROM migration_data.stork_data;
