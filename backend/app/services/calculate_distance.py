'''
##################################################################
📏 Step 5: Calculate distance and update
##################################################################
'''

from haversine import haversine
from app.services.database import connect_with_cursor  # for consistent DB connection handling

def run():
    """
    Calculates distances between consecutive GPS points using the Haversine formula,
    and updates the `distance` column in the migration_data.stork_data table.
    """
    conn = None
    cur = None

    try:
        conn, cur = connect_with_cursor()
        cur.execute('SET search_path TO migration_data;')

        # Add the new 'distance' column if it doesn't already exist
        cur.execute("""
            ALTER TABLE migration_data.stork_data
            ADD COLUMN IF NOT EXISTS distance DOUBLE PRECISION;
        """)
        print("✅ Column 'distance' added or already exists.")

        # Fetch data with current and next coordinates using LEAD
        cur.execute("""
            SELECT record_id, location_lat_5dp, location_long_5dp, 
                   LEAD(location_lat_5dp) OVER (PARTITION BY individual_local_identifier ORDER BY record_id) AS next_lat,
                   LEAD(location_long_5dp) OVER (PARTITION BY individual_local_identifier ORDER BY record_id) AS next_long
            FROM migration_data.stork_data;
        """)
        rows = cur.fetchall()
        print(f"📦 Fetched {len(rows)} rows for distance calculation.")

        updates = []
        for row in rows:
            record_id, lat1, long1, lat2, long2 = row
            if None not in (lat1, long1, lat2, long2):
                distance = haversine((float(lat1), float(long1)), (float(lat2), float(long2)), unit='m')
                updates.append((distance, record_id))

        print(f"📝 Prepared {len(updates)} distance updates.")

        if updates:
            cur.executemany("""
                UPDATE migration_data.stork_data
                SET distance = %s
                WHERE record_id = %s;
            """, updates)
            print("✅ Batch distance update completed.")

        conn.commit()
        print("🛠 Changes committed to database.")

    except Exception as e:
        print(f"❌ Error in calculate_distance.run(): {e}")
        if conn:
            conn.rollback()
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
        print("🔌 Database connection closed.")
