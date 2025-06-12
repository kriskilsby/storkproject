"""
##################################################################
🧭 Step 4: Calculate compass direction and update
##################################################################
"""

from app.services.database import connect_with_cursor  # Use consistent DB connection helper


def add_compass_column(cur):
    try:
        cur.execute("""
            ALTER TABLE migration_data.stork_data
            ADD COLUMN IF NOT EXISTS compass_direction VARCHAR(15);
        """)
        print("✅ Column 'compass_direction' ensured.")
    except Exception as e:
        print(f"❌ Error adding column 'compass_direction': {e}")
        raise


def update_compass_directions(cur):
    try:
        cur.execute("""
            UPDATE migration_data.stork_data
            SET compass_direction = CASE
                WHEN (calculated_heading >= 337.5 OR calculated_heading < 22.5) THEN 'North'
                WHEN (calculated_heading >= 22.5 AND calculated_heading < 67.5) THEN 'North East'
                WHEN (calculated_heading >= 67.5 AND calculated_heading < 112.5) THEN 'East'
                WHEN (calculated_heading >= 112.5 AND calculated_heading < 157.5) THEN 'South East'
                WHEN (calculated_heading >= 157.5 AND calculated_heading < 202.5) THEN 'South'
                WHEN (calculated_heading >= 202.5 AND calculated_heading < 247.5) THEN 'South West'
                WHEN (calculated_heading >= 247.5 AND calculated_heading < 292.5) THEN 'West'
                WHEN (calculated_heading >= 292.5 AND calculated_heading < 337.5) THEN 'North West'
                ELSE 'Undefined'
            END;
        """)
        print("✅ Compass directions updated.")
    except Exception as e:
        print(f"❌ Error updating compass directions: {e}")
        raise


def run():
    """Main entry point for assigning compass directions."""
    conn = None
    cur = None
    try:
        conn, cur = connect_with_cursor()

        add_compass_column(cur)
        update_compass_directions(cur)

        conn.commit()
        print("✅ Compass direction transformation committed.")
    except Exception as e:
        print(f"❌ Compass direction processing failed: {e}")
        if conn:
            conn.rollback()
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()
        print("🔌 Compass direction DB connection closed.")
