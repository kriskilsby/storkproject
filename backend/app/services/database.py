'''
##################################################################
Step 2: Connect to DB and write pandas DataFrame to PostgreSQL
##################################################################
'''
"""
Handles:
1. Database connection
2. Schema/table existence checks
3. Duplicate row checking
4. Writing pandas DataFrames to PostgreSQL
"""

import os
from pathlib import Path
import pandas as pd
from dotenv import load_dotenv
import psycopg2
from psycopg2 import sql
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine.url import URL

# --- Load Environment Variables ---
env_path = Path(__file__).resolve().parents[2] / '.env'
load_dotenv(dotenv_path=env_path)

DB_CONFIG = {
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "host": os.getenv("DB_HOST"),
    "port": os.getenv("DB_PORT"),
    "database": os.getenv("DB_NAME"),
}

# --- Database Connection Functions ---

def connect_to_db():
    """Establishes and returns a psycopg2 connection with `migration_data` schema."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute('SET search_path TO migration_data')
        return conn
    except Exception as e:
        raise RuntimeError(f"Error connecting to database: {e}")

def get_engine():
    """Returns a SQLAlchemy engine for the PostgreSQL database."""
    url_object = URL.create(
        drivername="postgresql+psycopg2",
        username=DB_CONFIG["user"],
        password=DB_CONFIG["password"],
        host=DB_CONFIG["host"],
        port=DB_CONFIG["port"],
        database=DB_CONFIG["database"],
    )
    return create_engine(url_object)

# --- Schema/Table Existence Check ---

def check_table_exists(schema_name, table_name):
    """Checks whether a table exists in the given schema."""
    engine = get_engine()
    inspector = inspect(engine)
    return table_name in inspector.get_table_names(schema=schema_name)

# --- Duplicate Check ---

def check_duplicates(df, table_name, subset=None):
    """
    Checks for duplicate rows between a DataFrame and an existing table.
    
    Args:
        df: pandas DataFrame
        table_name: Target PostgreSQL table
        subset: Columns to compare on (default: all)
    
    Returns:
        Number of duplicate rows
    """
    engine = get_engine()
    db_df = pd.read_sql(f"SELECT * FROM migration_data.{table_name};", engine)

    if subset is None:
        subset = df.columns.tolist()

    merged = df.merge(db_df, on=subset, how='inner')
    return merged.shape[0]

# --- DataFrame Writing ---

def write_dataframe_to_db(df, table_name='stork_data', check_dupes=True, subset=None):
    """
    Writes a DataFrame to PostgreSQL, with optional duplicate filtering.
    
    Args:
        df: DataFrame to write
        table_name: Target table
        check_dupes: Whether to drop duplicates before inserting
        subset: Columns to check duplicates on
    """
    schema_name = 'migration_data'
    if not check_table_exists(schema_name, table_name):
        raise ValueError(f"Table '{schema_name}.{table_name}' does not exist!")

    if check_dupes:
        dups = check_duplicates(df, table_name, subset=subset)
        if dups > 0:
            df = df.drop_duplicates(subset=subset)

    try:
        engine = get_engine()
        df.to_sql(table_name, engine, schema=schema_name, if_exists='append', index=False)
    except Exception as e:
        raise RuntimeError(f"Failed to write DataFrame to database: {e}")

# --- Utility Query Functions ---

def run_update_query(query):
    """Executes an update query."""
    conn = connect_to_db()
    try:
        with conn.cursor() as cur:
            cur.execute(query)
    except Exception as e:
        raise RuntimeError(f"Error executing update query: {e}")
    finally:
        conn.close()

# --- Cursor Access Utility ---

def connect_with_cursor():
    """Returns psycopg2 connection and cursor with proper schema."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        conn.autocommit = False
        cur = conn.cursor()
        cur.execute('SET search_path TO migration_data')
        return conn, cur
    except Exception as e:
        raise RuntimeError(f"Error connecting with cursor: {e}")

def get_db_connection():
    """Same as connect_with_cursor, but autocommit is True."""
    conn = connect_to_db()
    cur = conn.cursor()
    cur.execute('SET search_path TO migration_data')
    return conn, cur

