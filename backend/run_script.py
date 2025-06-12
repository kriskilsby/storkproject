# Example detail for pipeline to run processing scripts
# backend/run_script.py
import time
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).resolve().parent / '.env')

from app.services import (
    data_processing,
    database,
    heading_calculator,
    compass_direction,
    calculate_distance,
    decimal_precision,
)

def run_data_upload_pipeline():
    engine = database.get_engine()

    for dataset_number in [1, 2, 3, 4]:
        print(f"\n📦 Processing Dataset {dataset_number}...")

        try:
            df = data_processing.load_and_clean_data(dataset_number, engine)
            print(f"✅ Dataset {dataset_number} uploaded.")
        except Exception as e:
            print(f"❌ Failed to process Dataset {dataset_number}: {e}")

    # ✅ Count and print total number of records after upload
    from sqlalchemy import text
    with engine.connect() as connection:
        result = connection.execute(text("SELECT COUNT(*) FROM migration_data.stork_data;")).scalar()
        print(f"\n📊 Total records now in 'stork_data': {result}")

def run_post_upload_transforms():
    print("\n🛠 Running database transformation scripts...")

    for name, func in [
        ("Decimal precision adjustment", decimal_precision.run),
        ("Heading calculation", heading_calculator.run),
        ("Compass direction assignment", compass_direction.run),
        ("Distance calculation", calculate_distance.run),
    ]:
        try:
            print(f"🔧 Running {name}...")
            func()
            print(f"✅ {name} complete.")
        except Exception as e:
            print(f"❌ {name} failed: {e}")

def run_pipeline():
    start_time = time.time()
    print("🚀 Starting pipeline...")
    run_data_upload_pipeline()
    run_post_upload_transforms()
    end_time = time.time()

    total_seconds = end_time - start_time
    minutes, seconds = divmod(total_seconds, 60)
    print(f"\n⏱ Pipeline completed in {int(minutes)}m {int(seconds)}s.")

if __name__ == "__main__":
    run_pipeline()
