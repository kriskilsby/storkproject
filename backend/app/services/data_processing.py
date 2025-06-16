'''
##############################################
 Step 1: Initial processing of raw datasets
##############################################
'''
# cleaning, filtering, transformation logic.

import pandas as pd
pd.plotting.register_matplotlib_converters()
import matplotlib
print(matplotlib.__version__)
# %matplotlib inline
# from dotenv import load_dotenv
import os
from app.services import database
print("Initial Setup Complete")

# Set display option to show all columns
pd.set_option('display.max_columns', None)

# STEP 1 - INITIAL DATASET SETUP
# https://builtin.com/data-science/pandas-show-all-columns
# Handles reading, cleaning, and transforming a given dataset

def load_and_clean_data(dataset_number, engine):

    # Show working directory and check for project folder
    print("Working directory:", os.getcwd())
    print("Project folder exists:", os.path.exists("stork_project"))

    # Define file paths
    paths = {
        1: "../datasets/white_stork_portugal_adults_and_juveniles_2016.csv",
        2: "../datasets/white_stork_portugal_adults_2017.csv",
        3: "../datasets/white_stork_portugal_adults_2018.csv",
        4: "../datasets/white_stork_portugal_adults-2022.csv"
    }

    if dataset_number not in paths:
        raise ValueError(f"Invalid dataset_number: {dataset_number}. Choose from 1 to 4.")

    print(f"Loading dataset from: {paths[dataset_number]}")
    df = pd.read_csv(paths[dataset_number], low_memory=False)


    # -------- STEP 2: select & normalise columns --------
    include = [
        'individual-local-identifier', 'tag-local-identifier', 'timestamp',
        'location-lat', 'location-long', 'flt:switch', 'heading'
    ]

    frame = df.reindex(columns=include)
    frame.columns = [
        'individual_local_identifier', 'tag_local_identifier', 'timestamp',
        'location_lat', 'location_long', 'flt_switch', 'heading'
    ]

    frame['timestamp'] = pd.to_datetime(frame['timestamp'])

    print("\nOriginal DataFrame columns and preview:")
    print(frame.columns)
    print(frame.head())

    # Check missing values
    print("\nMissing values (ascending):")
    print(frame.isna().sum().sort_values(ascending=True))


    # -------- STEP 3: Sort and Map flt:switch data --------
    MISSING_FLT = 9

    sorted_frame = frame.sort_values(by=['tag_local_identifier', 'timestamp']).reset_index(drop=True)
    sorted_frame['flt_switch'] = sorted_frame['flt_switch'].fillna(MISSING_FLT).astype('int64')
    sorted_frame['new_flt_switch'] = sorted_frame['flt_switch'].map({0: 1, 6: 2}).fillna(0).astype('int64')

    print("\nPreview of transformed dataset (top 10):")
    print(sorted_frame.head(10))
    print("\nnew_flt_switch value counts:")
    print(sorted_frame["new_flt_switch"].value_counts())

    print("\nData types:")
    print(sorted_frame.info())


   # -------- STEP 4: Remove unwanted birds --------
    ids_to_remove = [
        "432 Droolian", "331 Aldina", "431 Mojito", "376 Winston", "396_Norbett", "309 Medronho",
        "442 Mendel", "437 Mary", "430 Sherlock", "393 Sangria", "390 McPoopface", "403 Aberforth",
        "444_Pippin", "382_Crusoe", "387_Tonks", "439_Camelo", "435 Wilson", "Stork_443", "391 George",
        "440 Lack", "377 Schmidt", "383_Maxime", "Stork_373", "332_Alonzo", "379 Magnificant Storko",
        "429 Nata", "340_George C", "386 Bill", "385_Gadget", "373 Allyen", "380 Rosalin",
        "371 Stephen Storkwing", "375 Ramotswe", "368 Buckbeak", "05 Myrtle", "371 Ruin", "Stork_380"
    ]

    cleaned_frame = sorted_frame[~sorted_frame['individual_local_identifier'].isin(ids_to_remove)].copy()
    cleaned_frame.reset_index(drop=True, inplace=True)

    print(f"\nRecords before cleaning: {len(sorted_frame)}")
    print(f"Records after cleaning: {len(cleaned_frame)}")
    print(f"Total removed based on ID: {len(sorted_frame) - len(cleaned_frame)}")


   # -------- STEP 5: Special filter for dataset 1 --------
    if dataset_number == 1:
        before = len(cleaned_frame)
        cleaned_frame = cleaned_frame[~(
            (cleaned_frame['individual_local_identifier'] == '392 David Coultard_Adult') &
            (cleaned_frame['timestamp'] > pd.to_datetime("2020-12-31"))
        )]
        removed = before - len(cleaned_frame)
        print(f"Special filter: Removed {removed} entries for '392 David Coultard_Adult' after December 2020.")


    # -------- STEP 6: Drop rows with missing lat/long --------
    cleaned_sql_data = cleaned_frame.dropna(subset=['location_lat', 'location_long'])

    print("\nMissing values after dropping lat/long:")
    print(cleaned_sql_data.isnull().sum())


      # -------- STEP 7: Fill heading NaNs --------
    cleaned_sql_data.loc[:, 'heading'] = cleaned_sql_data['heading'].fillna(999)

    print("\nFinal missing values check:")
    print(cleaned_sql_data.isnull().sum())

    print("\nFinal dataset summary:")
    print(cleaned_sql_data.info())
    print("Shape:", cleaned_sql_data.shape)
    print("Preview:")
    print(cleaned_sql_data.head())

        # Write cleaned data to PostgreSQL
    database.write_dataframe_to_db(
        cleaned_sql_data,
        table_name="stork_data",
        check_dupes=False  # disables duplicate dropping
    )

    # Optional DB write (uncomment when ready)
    # from sqlalchemy import text
    # with engine.connect() as connection:
    #     count_query = text("SELECT COUNT(*) FROM migration_data.stork_data;")
    #     result = connection.execute(count_query).scalar()
    #     print(f"The number of records in the stork_data table: {result}")
    #
    # cleaned_sql_data.to_sql('stork_data', engine, schema='migration_data', if_exists='append', index=False)

    return cleaned_sql_data