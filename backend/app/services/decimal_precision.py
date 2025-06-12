### CREATING A COPY OF THE location_lat & location_long SHOWING THE DATA WITH 5 AND 3 DECIMAL PLACES TO ALLOW ACCURACY OF 1.11M OR 111M ###

# app/services/decimal_precision.py

import psycopg2
from app.services.database import get_db_connection  # Use your shared connection helper


def run():
    """Adds 5dp and 3dp latitude/longitude columns to stork_data with optional indexing."""
    print("📏 Running decimal precision adjustments...")

    conn, cur = get_db_connection()
    try:
        # Step 1: Add 5-decimal precision columns
        cur.execute("""
            ALTER TABLE migration_data.stork_data
            ADD COLUMN IF NOT EXISTS location_lat_5dp NUMERIC(9, 5),
            ADD COLUMN IF NOT EXISTS location_long_5dp NUMERIC(9, 5);
        """)
        cur.execute("""
            UPDATE migration_data.stork_data
            SET location_lat_5dp = ROUND(location_lat::NUMERIC, 5),
                location_long_5dp = ROUND(location_long::NUMERIC, 5)
            WHERE location_lat_5dp IS NULL OR location_long_5dp IS NULL;
        """)
        print("✅ 5-decimal precision columns created and populated.")

        # Step 2: Add 3-decimal precision columns for grouping
        cur.execute("""
            ALTER TABLE migration_data.stork_data
            ADD COLUMN IF NOT EXISTS location_lat_3dp NUMERIC(7, 3),
            ADD COLUMN IF NOT EXISTS location_long_3dp NUMERIC(7, 3);
        """)
        cur.execute("""
            UPDATE migration_data.stork_data
            SET location_lat_3dp = ROUND(location_lat::NUMERIC, 3),
                location_long_3dp = ROUND(location_long::NUMERIC, 3)
            WHERE location_lat_3dp IS NULL OR location_long_3dp IS NULL;
        """)
        print("✅ 3-decimal grouping columns created and populated.")

        # Step 3: Create index
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_location_3dp 
            ON migration_data.stork_data (location_lat_3dp, location_long_3dp);
        """)
        print("✅ Index on 3-decimal grouping columns created.")

        conn.commit()

    except Exception as e:
        print(f"❌ Decimal precision adjustment failed: {e}")
        conn.rollback()

    finally:
        cur.close()
        conn.close()
        print("🔒 Database connection closed.")
