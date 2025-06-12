# backend/app/services/data_processing.py

import pandas as pd
import os

# Dictionary of dataset file paths
DATASET_PATHS = {
    1: "datasets/white_stork_portugal_adults_and_juveniles_2016.csv",
    2: "datasets/white_stork_portugal_adults_2017.csv",
    3: "datasets/white_stork_portugal_adults_2018.csv",
    4: "datasets/white_stork_portugal_adults-2022.csv"
}

# Columns to keep and standardise across all datasets.
COLUMNS_TO_KEEP = [
    'individual-local-identifier',
    'tag-local-identifier',
    'timestamp',
    'location-lat',
    'location-long',
    'flt:switch',
    'heading'
]

#  Rename to these final column names
RENAMED_COLUMNS = [
    'individual_local_identifier',
    'tag_local_identifier',
    'timestamp',
    'location_lat',
    'location_long',
    'flt_switch',
    'heading'
]

# The hardcoded list of bird IDs to remove as they contain < 6 months tracking data
EXCLUDE_IDS = [
    "432 Droolian", "331 Aldina", "431 Mojito", "376 Winston", "396_Norbett", "309 Medronho",
    "442 Mendel", "437 Mary", "430 Sherlock", "393 Sangria", "390 McPoopface", "403 Aberforth",
    "444_Pippin", "382_Crusoe", "387_Tonks", "439_Camelo", "435 Wilson", "Stork_443", "391 George",
    "440 Lack", "377 Schmidt", "383_Maxime", "Stork_373", "332_Alonzo", "379 Magnificant Storko",
    "429 Nata", "340_George C", "386 Bill", "385_Gadget", "373 Allyen", "380 Rosalin",
    "371 Stephen Storkwing", "375 Ramotswe", "368 Buckbeak", "05 Myrtle", "371 Ruin", "Stork_380"
]

# Load dataset function
"""
a. Purpose: Load the CSV file for a given dataset number.
b. Checks if the file exists before attempting to read it.
c. Reads into a pandas DataFrame.
"""
def load_dataset(dataset_number=1):
    path = DATASET_PATHS.get(dataset_number)
    if not path or not os.path.exists(path):
        raise FileNotFoundError(f"Dataset {dataset_number} not found at {path}")
    return pd.read_csv(path, low_memory=False)


# Main function to clean and transform the raw data
def clean_and_transform(df, dataset_number):
    df = df.reindex(columns=COLUMNS_TO_KEEP)            # Keeps only relevant columns and inserts NaNs for any that are missing
    df.columns = RENAMED_COLUMNS                        # Renames the columns to match database names
    df['timestamp'] = pd.to_datetime(df['timestamp'])   # Converts the timestamp column from string/object to proper datetime format

    # Sort and clean flt_switch
    """
    Creates new flt switch column and map:
    GPS (0) → 1
    Burst data (6) → 2
    All other values → 0
    """
    df = df.sort_values(by=['tag_local_identifier', 'timestamp']).reset_index(drop=True)    # Sorts data by timestamp, and by stork name tag
    df['flt_switch'] = df['flt_switch'].fillna(9).astype('int64')       # Replaces missing values in flt_switch with 9 and converts the column to integers.
    df['new_flt_switch'] = df['flt_switch'].map({0: 1, 6: 2}).fillna(0).astype('int64')     # Add mapping shown above

    # Remove unwanted identifiers
    df = df[~df['individual_local_identifier'].isin(EXCLUDE_IDS)].reset_index(drop=True)    # Filters out specific birds from the dataset based on known ID list

    # Special handling for dataset 1: Remove entries after Dec 2020 for one bird
    if dataset_number == 1:
        mask = ~(
            (df['individual_local_identifier'] == "392 David Coultard Adult") &
            (df['timestamp'] > pd.Timestamp("2020-12-31"))
        )
        # Reports how many records were removed
        removed_count = (~mask).sum()
        print(f"Removed {removed_count} records for 392 David Coultard Adult after Dec 2020")
        df = df[mask]

    # Remove rows with missing lat/long
    df = df.dropna(subset=['location_lat', 'location_long'])

    # Fill missing heading with placeholder 999
    df['heading'] = df['heading'].fillna(999)

    # Return the cleaned and processed DataFrame
    return df

# Function to combine load_dataset and clean_and_transform, then confirms shape of data
def load_and_clean_data(dataset_number=1):
    print(f"\n--- Loading Dataset {dataset_number} ---")
    raw_df = load_dataset(dataset_number)
    cleaned_df = clean_and_transform(raw_df, dataset_number)
    print(f"✅ Cleaned dataset shape: {cleaned_df.shape}")
    return cleaned_df


# Optional DB insert logic
def upload_to_postgres(df, engine, table_name='stork_data', schema='migration_data'):
    from sqlalchemy import text
    print(f"Uploading to {schema}.{table_name}...")
    df.to_sql(table_name, engine, schema=schema, if_exists='append', index=False)

    with engine.connect() as conn:
        count_query = text(f"SELECT COUNT(*) FROM {schema}.{table_name};")
        result = conn.execute(count_query).scalar()
        print(f"✅ Table now contains {result} rows.")


# For testing manually
if __name__ == "__main__":
    from backend.app.services.database import get_engine  # Make sure this function exists
    engine = get_engine()
    df = load_and_clean_data(dataset_number=2)
    upload_to_postgres(df, engine)
