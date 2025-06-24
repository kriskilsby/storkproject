# scripts/get_metadata.py

import sys
import os
import json
from dotenv import load_dotenv

# Add path to import your DB module
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend', 'app', 'services')))
import database

# Load env vars
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))
load_dotenv(dotenv_path)

# def get_metadata():
#     conn, cur = database.get_db_connection()
#     try:
#         cur.execute("SELECT DISTINCT individual_local_identifier FROM migration_data.stork_data ORDER BY individual_local_identifier")
#         birds = [row[0] for row in cur.fetchall()]

#         cur.execute("SELECT DISTINCT EXTRACT(YEAR FROM timestamp)::int AS year FROM migration_data.stork_data ORDER BY year")
#         years = [int(row[0]) for row in cur.fetchall()]

#         print(json.dumps({ "birds": birds, "years": years }))  # output as JSON
#     except Exception as e:
#         print(json.dumps({ "error": str(e) }), file=sys.stderr)
#         sys.exit(1)
#     finally:
#         cur.close()
#         conn.close()

def get_metadata():
    conn, cur = database.get_db_connection()
    try:
        query = """
        SELECT
            individual_local_identifier AS bird,
            EXTRACT(YEAR FROM timestamp)::int AS year,
            COUNT(*) AS count
        FROM migration_data.stork_data
        GROUP BY bird, year
        ORDER BY bird, year;
        """
        cur.execute(query)
        rows = cur.fetchall()

        birds = {}
        years = {}

        for bird, year, count in rows:
            year = int(year)
            count = int(count)

            # Bird-centric mapping
            if bird not in birds:
                birds[bird] = {}
            birds[bird][year] = count

            # Year-centric mapping
            if year not in years:
                years[year] = {}
            years[year][bird] = count

        print(json.dumps({
            "birds": birds,
            "years": years
        }))
    except Exception as e:
        print(json.dumps({ "error": str(e) }), file=sys.stderr)
        sys.exit(1)
    finally:
        cur.close()
        conn.close()

if __name__ == "__main__":
    get_metadata()
