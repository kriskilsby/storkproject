import psycopg2
import pandas as pd
import numpy as np
from io import StringIO
from tqdm import tqdm

# Connect to the database
conn = psycopg2.connect(
    dbname="stork_migration_data",
    user="postgres",
    password="Firetrap77",
    host="localhost",
    port="5432"
)
conn.autocommit = True

# Haversine distance (meters)
def haversine(lat1, lon1, lat2, lon2):
    R = 6371000
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    a = np.sin(dphi/2)**2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda/2)**2
    return R * 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))

# Compass heading (degrees)
def calculate_heading(lat1, lon1, lat2, lon2):
    dlon = np.radians(lon2 - lon1)
    lat1 = np.radians(lat1)
    lat2 = np.radians(lat2)
    x = np.sin(dlon) * np.cos(lat2)
    y = np.cos(lat1) * np.sin(lat2) - np.sin(lat1) * np.cos(lat2) * np.cos(dlon)
    heading = (np.degrees(np.arctan2(x, y)) + 360) % 360
    return heading

# Get all birds in the dataset
with conn.cursor() as cur:
    cur.execute("""
        SELECT DISTINCT individual_local_identifier 
        FROM migration_data.stork_data 
        ORDER BY individual_local_identifier
    """)
    bird_ids = [row[0] for row in cur.fetchall()]

print(f"🚀 Processing ALL birds: {len(bird_ids)} found")

# Create temp table once before the loop, preserving rows on commit
with conn.cursor() as cur:
    cur.execute("""
        CREATE TEMP TABLE temp_updates (
            record_id INTEGER,
            sql_heading DOUBLE PRECISION,
            sql_distance DOUBLE PRECISION
        ) ON COMMIT PRESERVE ROWS
    """)

# Main processing loop
for bird_id in tqdm(bird_ids, desc="Processing birds"):
    try:
        query = """
            SELECT record_id, timestamp, location_lat, location_long
            FROM migration_data.stork_data
            WHERE individual_local_identifier = %s
            ORDER BY timestamp
        """
        df = pd.read_sql_query(query, conn, params=(bird_id,))
        if len(df) < 2:
            continue

        df['lat_next'] = df['location_lat'].shift(-1)
        df['lon_next'] = df['location_long'].shift(-1)

        df['sql_distance'] = haversine(df['location_lat'], df['location_long'],
                                       df['lat_next'], df['lon_next'])
        df['sql_heading'] = calculate_heading(df['location_lat'], df['location_long'],
                                              df['lat_next'], df['lon_next'])

        df = df.iloc[:-1]  # Drop the last row with NaNs

        buffer = StringIO()
        df[['record_id', 'sql_heading', 'sql_distance']].to_csv(buffer, index=False, header=False)
        buffer.seek(0)

        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE temp_updates")

            cur.copy_expert("""
                COPY temp_updates (record_id, sql_heading, sql_distance)
                FROM STDIN WITH CSV
            """, buffer)

            cur.execute("""
                UPDATE migration_data.stork_data AS main
                SET sql_heading = temp.sql_heading,
                    sql_distance = temp.sql_distance
                FROM temp_updates AS temp
                WHERE main.record_id = temp.record_id
            """)

    except Exception as e:
        print(f"❌ Error processing bird '{bird_id}': {e}")

print("✅ All birds processed successfully.")
conn.close()
