"""
#####################################################################
 Step 3: Calculate headings and populate calculated_heading column
#####################################################################
"""

import math
from app.services.database import connect_with_cursor  # Adjust this path based on your project structure


def calc_bearing(lat1, long1, lat2, long2):
    """
    Calculate the bearing between two points.

    Parameters:
    lat1, long1: Latitude and Longitude of point 1 in decimal degrees
    lat2, long2: Latitude and Longitude of point 2 in decimal degrees

    Returns:
    compass_bearing: Bearing in degrees from point 1 to point 2
    """
    lat1_rad, long1_rad, lat2_rad, long2_rad = map(math.radians, [lat1, long1, lat2, long2])
    dlon = long2_rad - long1_rad

    x = math.sin(dlon) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - (math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(dlon))

    initial_bearing = math.atan2(x, y)
    initial_bearing_deg = math.degrees(initial_bearing)

    compass_bearing = (initial_bearing_deg + 360) % 360
    return compass_bearing


def create_calculated_heading_column():
    """Create the calculated_heading column if it does not exist."""
    conn, cur = connect_with_cursor()
    try:
        cur.execute("""
            ALTER TABLE migration_data.stork_data
            ADD COLUMN IF NOT EXISTS calculated_heading NUMERIC;
        """)
        conn.commit()
        print(" 'calculated_heading' column ensured in stork_data.")
    except Exception as e:
        print(f" Error creating 'calculated_heading' column: {e}")
        conn.rollback()
    finally:
        cur.close()
        conn.close()


def calculate_heading():
    """Calculate and update headings for each movement in stork_data table."""
    print(" Starting heading calculation...")

    conn, cur = connect_with_cursor()

    try:
        # Step 1: Fetch coordinates along with their next coordinates
        cur.execute("""
            SELECT 
                record_id, location_lat_5dp, location_long_5dp,
                LEAD(location_lat_5dp) OVER (
                    PARTITION BY individual_local_identifier ORDER BY timestamp
                ) AS next_lat,
                LEAD(location_long_5dp) OVER (
                    PARTITION BY individual_local_identifier ORDER BY timestamp
                ) AS next_long
            FROM migration_data.stork_data
            ORDER BY individual_local_identifier, timestamp
        """)
        rows = cur.fetchall()

        # Step 2: Compute headings and prepare updates
        updates = []
        for row in rows:
            record_id, lat1, long1, lat2, long2 = row
            if None not in (lat1, long1, lat2, long2):
                heading = calc_bearing(lat1, long1, lat2, long2)
                updates.append((heading, record_id))

        print(f" Calculated headings for {len(updates)} records.")

        # Step 3: Update the table with new heading values
        cur.executemany("""
            UPDATE migration_data.stork_data
            SET calculated_heading = %s
            WHERE record_id = %s
        """, updates)
        conn.commit()

        print(" Heading calculations committed to database.")

    except Exception as e:
        print(f" Error calculating headings: {e}")
        conn.rollback()

    finally:
        cur.close()
        conn.close()
        print(" Database connection closed.")


def run():
    """Entry point for running the heading calculation as part of the pipeline."""
    create_calculated_heading_column()
    calculate_heading()
