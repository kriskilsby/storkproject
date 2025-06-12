from dotenv import load_dotenv
import sys
import os
import json
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans, DBSCAN
import hdbscan
# from sklearn.metrics import silhouette_score, adjusted_rand_score
from sklearn.metrics import (
    silhouette_score,
    adjusted_rand_score,
    calinski_harabasz_score,
    davies_bouldin_score
)
import datetime

# Add services to path for import
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend', 'app', 'services')))
import database  #  Your working DB connection helper

# Absolute path to your backend .env file
dotenv_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))
load_dotenv(dotenv_path)

# Debug: Print loaded env vars
print(f".env path: {dotenv_path}", file=sys.stderr)
print("Loaded environment variables:", file=sys.stderr)
print("DB_USER =", os.getenv("DB_USER"), file=sys.stderr)
print("DB_PASSWORD =", "SET" if os.getenv("DB_PASSWORD") else "NOT SET", file=sys.stderr)
print("DB_HOST =", os.getenv("DB_HOST"), file=sys.stderr)
print("DB_PORT =", os.getenv("DB_PORT"), file=sys.stderr)
print("DB_NAME =", os.getenv("DB_NAME"), file=sys.stderr)



def fetch_data(query):
    conn, cur = database.get_db_connection()
    try:
        cur.execute(query)
        rows = cur.fetchall()
        # Get column names from cursor description
        colnames = [desc[0] for desc in cur.description]
        # Convert to pandas DataFrame
        df = pd.DataFrame(rows, columns=colnames)
        return df
    except Exception as e:
        print(f"Error fetching data: {e}")
        return pd.DataFrame()  # Return empty DataFrame on error
    finally:
        cur.close()
        conn.close()

def run_clustering(method='kmeans', params={}):
    # Defaults
    decimal_places = int(params.get('decimal_places', 3))
    interval_minutes = int(params.get('interval_minutes', 15))
    sample_rate = int(params.get('sample_rate', 20))

    # Sanity check
    interval_minutes = max(1, min(interval_minutes, 60))  # Clamp to [1, 60]

    # Use raw lat/long for full flexibility
    sql_query = f"""
    SELECT individual_local_identifier,
        location_lat,
        location_long,
        calculated_heading,
        distance,
        compass_direction,
        date_trunc('hour', timestamp) +
            INTERVAL '1 minute' * (FLOOR(EXTRACT(MINUTE FROM timestamp) / {interval_minutes}) * {interval_minutes}) AS timestamp
    FROM migration_data.stork_data
    WHERE distance IS NOT NULL
      AND calculated_heading IS NOT NULL
      AND NOT (calculated_heading = 0 AND distance = 0);
    """
    
    data = fetch_data(sql_query)
    print(f"[DEBUG] Fetched {len(data)} rows from SQL", file=sys.stderr)

    if data.empty:
        return pd.DataFrame(), {"error": "No data fetched from database"}

    # Deduplicate: one point per bird per rounded timestamp
    df = data.drop_duplicates(subset=["individual_local_identifier", "timestamp"])
    print(f"[DEBUG] After deduplication: {len(df)} rows", file=sys.stderr)

    # Sample
    df = df.iloc[::sample_rate].copy()
    print(f"[DEBUG] After sampling (rate={sample_rate}): {len(df)} rows", file=sys.stderr)

    # Round coordinates
    df['location_lat_rounded'] = df['location_lat'].round(decimal_places)
    df['location_long_rounded'] = df['location_long'].round(decimal_places)

    # Convert timestamp to datetime, ensuring all timezone-aware datetimes are converted to UTC
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)

    # Add year and month to the clustering
    # df['year'] = df['timestamp'].dt.year
    # df['month'] = df['timestamp'].dt.month

    # Select only numeric fields for clustering
    X = df.select_dtypes(include=[np.number])
    print(f"[DEBUG] Clustering on {len(X)} rows, columns: {X.columns.tolist()}", file=sys.stderr)

    try:
        if method == 'kmeans':
            n_clusters = int(params.get('n_clusters', 5))
            model = KMeans(n_clusters=n_clusters)
        elif method == 'dbscan':
            model = DBSCAN(
                eps=float(params.get('eps', 0.5)),
                min_samples=int(params.get('min_samples', 5))
            )
        elif method == 'hdbscan':
            model = hdbscan.HDBSCAN(min_cluster_size=int(params.get('min_cluster_size', 5)))
        else:
            return pd.DataFrame(), {"error": f"Unsupported clustering method '{method}'"}

        labels = model.fit_predict(X)
        df['cluster'] = labels.tolist()
        counts = df['cluster'].value_counts().to_dict()

        # Evaluation metrics
        silhouette_avg = silhouette_score(X, labels) if len(set(labels)) > 1 and len(X) > len(set(labels)) else None
        ari_score = adjusted_rand_score(df['individual_local_identifier'], labels) if 'individual_local_identifier' in df else None
        ch_score = calinski_harabasz_score(X, labels) if len(set(labels)) > 1 else None
        db_score = davies_bouldin_score(X, labels) if len(set(labels)) > 1 else None

        # Count noise points (label = -1), if any
        noise_ratio = (labels == -1).sum() / len(labels) if -1 in labels else 0

        # return df, {
        #     "clusters": counts,
        #     "method": method,
        #     "params": params,
        # }
    
        meta = {
            "clusters": counts,
            "method": method,
            "params": params,
            "metrics": {
                "silhouette_score": silhouette_avg,
                "adjusted_rand_index": ari_score,
                "calinski_harabasz": ch_score,
                "davies_bouldin": db_score,
                "n_clusters": len(set(labels)) - (1 if -1 in labels else 0),
                "noise_ratio": noise_ratio
            }
        }

        return df, meta

    except Exception as e:
        return pd.DataFrame(), {"error": str(e)}



if __name__ == "__main__":
    # Read command-line args
    method = sys.argv[1] if len(sys.argv) > 1 else 'kmeans'
    params_json = sys.argv[2] if len(sys.argv) > 2 else '{}'

    try:
        params = json.loads(params_json)
    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON in parameters"}))
        sys.exit(1)

    # result = run_clustering(method, params)
    # print(json.dumps(result))

    df, meta = run_clustering(method, params)

    # Check for errors and print to stderr if found
    if "error" in meta:
        print(json.dumps(meta), file=sys.stderr)
        sys.exit(1)

    # Sent everything to the results
    meta["all_points"] = df.to_dict(orient="records")

    def default_converter(o):
        if isinstance(o, (pd.Timestamp, np.datetime64)):
            return str(o)
        if isinstance(o, (datetime.datetime, datetime.date)):
            return o.isoformat()
        return str(o)

    print(json.dumps(meta, default=default_converter))


