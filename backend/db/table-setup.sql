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
