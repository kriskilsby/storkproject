from dotenv import load_dotenv
import sys
import os
import json
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans, DBSCAN
import hdbscan
from sklearn.preprocessing import StandardScaler
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

# Function that connects to the database and runs an SQL query
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
        # print(f"Error fetching data: {e}")
        print(f"[ERROR] fetching data: {e}", file=sys.stderr)
        return pd.DataFrame()  # Return empty DataFrame on error
    finally:
        cur.close()
        conn.close()

# New helper function to return the total numbers for debug checks
def fetch_counts(interval_minutes, sample_rate):
    time_bucket = f"""
        date_trunc('hour', timestamp) +
        INTERVAL '1 minute' * (FLOOR(EXTRACT(MINUTE FROM timestamp) / {interval_minutes}) * {interval_minutes})
    """ if interval_minutes > 0 else "timestamp"

    count_query = f"""
    WITH 
    filtered_base AS (
        SELECT *
        FROM migration_data.stork_data
        WHERE sql_distance IS NOT NULL AND sql_heading IS NOT NULL
    ),
    deduped AS (
        SELECT *,
            {time_bucket} AS rounded_timestamp,
            ROW_NUMBER() OVER (
                PARTITION BY individual_local_identifier, {time_bucket}
                ORDER BY timestamp
            ) AS rn
        FROM filtered_base
    ),
    filtered_deduped AS (
        SELECT *
        FROM deduped
        WHERE rn = 1
    ),
    sampled AS (
        SELECT *
        FROM filtered_deduped
        WHERE MOD(record_id, {sample_rate}) = 0
    )
    SELECT 
        (SELECT COUNT(*) FROM filtered_base) AS count_after_filtering,
        (SELECT COUNT(*) FROM filtered_deduped) AS count_after_deduplication,
        (SELECT COUNT(*) FROM sampled) AS count_after_sampling;
    """

    counts_df = fetch_data(count_query)
    if not counts_df.empty:
        counts = counts_df.iloc[0].to_dict()
        print("[DEBUG] Count summary from SQL:", file=sys.stderr)
        for k, v in counts.items():
            print(f"  {k}: {v}", file=sys.stderr)
    else:
        print("[DEBUG] Failed to fetch count summary", file=sys.stderr)


# Function to run all the core clustering logic
def run_clustering(method='kmeans', params={}):
    
    # Extracts parameters with defaults
    decimal_places = int(params.get('decimal_places', 3))
    interval_minutes = int(params.get('interval_minutes', 15))
    sample_rate = int(params.get('sample_rate', 20))

    # Set interval_minutes between 1 and 60
    interval_minutes = max(0, min(interval_minutes, 60))  

       # Set Boolean flags to use additional features
    def str_to_bool(val):
        return str(val).lower() == 'true'

    use_distance = str_to_bool(params.get('use_distance', False))
    use_heading = str_to_bool(params.get('use_heading', False))
    use_year = str_to_bool(params.get('use_year', False))
    use_month = str_to_bool(params.get('use_month', False))
    use_scaling = str_to_bool(params.get('use_scaling', False))
    use_coordinates = str_to_bool(params.get('use_coordinates', True))
    use_interval_mins = str_to_bool(params.get('use_interval_mins', True))


    # Debug output to show parameters chosen
    print("[INFO] Parameters used for clustering:", file=sys.stderr)
    print(f"  method: {method}", file=sys.stderr)
    print(f"  decimal_places: {decimal_places}", file=sys.stderr)
    print(f"  interval_minutes: {interval_minutes}", file=sys.stderr)
    print(f"  sample_rate: {sample_rate}", file=sys.stderr)
    print(f"  use_scaling: {use_scaling}", file=sys.stderr)
    print("[INFO] Data collection setup:", file=sys.stderr)
    print(f"  use_coordinates: {use_coordinates}", file=sys.stderr)
    print(f"  use_interval_mins: {use_interval_mins}", file=sys.stderr)
    print(f"  use_distance: {use_distance}", file=sys.stderr)
    print(f"  use_heading: {use_heading}", file=sys.stderr)
    print(f"  use_year: {use_year}", file=sys.stderr)
    print(f"  use_month: {use_month}", file=sys.stderr)
      
    if interval_minutes > 0:
        time_bucket = f"""
        date_trunc('hour', timestamp) +
        INTERVAL '1 minute' * (FLOOR(EXTRACT(MINUTE FROM timestamp) / {interval_minutes}) * {interval_minutes})
        """
    else:
        time_bucket = "timestamp"

        # KK new added - Build WHERE clause
    filter_clauses = ["sql_distance IS NOT NULL", "sql_heading IS NOT NULL"]
    if selected_years:
        year_str = ', '.join(str(y) for y in selected_years)
        filter_clauses.append(f"EXTRACT(YEAR FROM timestamp) IN ({year_str})")
    if selected_birds:
        bird_str = ', '.join(f"'{b}'" for b in selected_birds)
        filter_clauses.append(f"individual_local_identifier IN ({bird_str})")

    where_clause = " AND ".join(filter_clauses)

    sql_query = f"""
    WITH
    filtered_base AS (
    SELECT * FROM migration_data.stork_data
    WHERE {where_clause}
    ),
    deduped AS (
    SELECT *,
        {time_bucket} AS rounded_timestamp,
        ROW_NUMBER() OVER (
        PARTITION BY individual_local_identifier, {time_bucket}, location_lat, location_long  
        ORDER BY timestamp
        ) AS rn
    FROM filtered_base
    ),
    filtered_deduped AS (
    SELECT * FROM deduped WHERE rn = 1
    ),
    sampled AS (
    SELECT * FROM filtered_deduped WHERE MOD(record_id, {sample_rate}) = 0
    ),
    counts AS (
    SELECT
        (SELECT COUNT(*) FROM filtered_base) AS count_after_filtering,
        (SELECT COUNT(*) FROM filtered_deduped) AS count_after_deduplication,
        (SELECT COUNT(*) FROM sampled) AS count_after_sampling
    )
    SELECT
        s.individual_local_identifier,
        s.location_lat,
        s.location_long,
        s.sql_heading AS calculated_heading,
        s.sql_distance AS distance,
        s.compass_direction,
        s.rounded_timestamp AS timestamp,
        c.count_after_filtering,
        c.count_after_deduplication,
        c.count_after_sampling
    FROM sampled s
    CROSS JOIN counts c;
    """

    data = fetch_data(sql_query)
    # print(f"[DEBUG] Fetched {len(data)} rows from SQL", file=sys.stderr)

    if data.empty:
        return pd.DataFrame(), {"error": "No data fetched from database"}

    df = data.copy()

    # Right after fetching the DataFrame
    count_after_filtering = df['count_after_filtering'].iloc[0]
    count_after_deduplication = df['count_after_deduplication'].iloc[0]
    count_after_sampling = df['count_after_sampling'].iloc[0]

    # Optional: print them for debugging/logging
    print(f"[DEBUG] Count summary from SQL:", file=sys.stderr)
    print(f"  count_after_filtering: {count_after_filtering}", file=sys.stderr)
    print(f"  count_after_deduplication: {count_after_deduplication}", file=sys.stderr)
    print(f"  count_after_sampling: {count_after_sampling}", file=sys.stderr)

    # Then drop these before clustering
    df = df.drop(columns=['count_after_filtering', 'count_after_deduplication', 'count_after_sampling'])

    USE_DISTANCE = use_distance
    USE_HEADING = use_heading
    USE_YEAR = use_year
    USE_MONTH = use_month
    USE_SCALING = use_scaling    
    
 
    decimal_places = int(params.get('decimal_places', -1))
    use_coordinates = str_to_bool(params.get('use_coordinates', True))
    use_interval_mins = str_to_bool(params.get('use_interval_mins', False))
    interval_minutes = int(params.get('interval_minutes', 0))  # already coming from frontend   
    
    # Round lat/lon
    if decimal_places < 0:
        # Use full precision
        df['location_lat_rounded'] = df['location_lat']
        df['location_long_rounded'] = df['location_long']
    else:
        # Round coordinates
        df['location_lat_rounded'] = df['location_lat'].round(decimal_places)
        df['location_long_rounded'] = df['location_long'].round(decimal_places)

    # Convert timestamp to datetime, ensuring all timezone-aware datetimes are converted to UTC
    df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)

    print("[DEBUG] location_lat_rounded_types:",
      df["location_lat_rounded"].apply(lambda x: str(type(x))).value_counts().to_dict(),
      file=sys.stderr)

    features = []

    if use_coordinates:
        features += ['location_lat_rounded', 'location_long_rounded']

    if USE_DISTANCE and 'distance' in df.columns:
        features.append('distance')

    if USE_HEADING and 'calculated_heading' in df.columns:
        features.append('calculated_heading')

    if USE_YEAR:
        df['year'] = df['timestamp'].dt.year
        features.append('year')

    if USE_MONTH:
        df['month'] = df['timestamp'].dt.month
        features.append('month')

    if use_interval_mins and interval_minutes > 0:
        # Convert to a bucket index (integer)
        df['interval_bucket'] = (df['timestamp'].astype('int64') // (interval_minutes * 60 * 10**9)).astype(int)
        features.append('interval_bucket')

    X = df[features]

    # Normalize only for kmeans
    if USE_SCALING:
        print(f"[DEBUG] Scaling features with StandardScaler (method = {method})", file=sys.stderr)
        X = StandardScaler().fit_transform(X)
    else:
        print(f"[DEBUG] Skipping feature scaling (method = {method})", file=sys.stderr)

    try:
        labels = None
        model = None
        metrics = {} # this was added as new

        if method == 'kmeans':
            print("[DEBUG] Running KMeans clustering...", file=sys.stderr)
            if params.get('auto_silhouette'):
                print("  Auto silhouette analysis enabled", file=sys.stderr)
                # Auto silhouette analysis to find best k
                best_score = -1
                best_k = 2
                best_labels = None

                for k in range(2, 21):  # Try 2 to 10 clusters
                    km = KMeans(n_clusters=k, random_state=42, n_init="auto")
                    lbls = km.fit_predict(X)
                    score = silhouette_score(X, lbls)
                    if score > best_score:
                        best_score = score
                        best_k = k
                        best_labels = lbls

                labels = best_labels
                metrics["silhouette_score"] = best_score
                metrics["n_clusters"] = best_k

                print("[DEBUG] Silhouette Analysis (KMeans)", file=sys.stderr)
                print(f"  Best silhouette score: {best_score:.4f}", file=sys.stderr)
                print(f"  Optimal number of clusters: {best_k}", file=sys.stderr)

            else:
                n_clusters = int(params.get('n_clusters', 5))
                print(f"  n_clusters: {n_clusters}", file=sys.stderr)
                model = KMeans(n_clusters=n_clusters, random_state=42, n_init="auto")

        elif method == 'dbscan':
            eps = float(params.get('eps', 0.5))
            min_samples = int(params.get('min_samples', 5))
            leaf_size = int(params.get('leaf_size', 40))
            print("[DEBUG] Running DBSCAN clustering...", file=sys.stderr)
            print(f"  eps: {eps}", file=sys.stderr)
            print(f"  min_samples: {min_samples}", file=sys.stderr)
            print(f"  leaf_size: {leaf_size}", file=sys.stderr)
            model = DBSCAN(eps=eps, min_samples=min_samples, leaf_size=leaf_size)

        elif method == 'hdbscan':
            min_cluster_size = int(params.get('min_cluster_size', 5))
            max_cluster_size_param = params.get('max_cluster_size')
            leaf_size = int(params.get('leaf_size', 40))

            print("[DEBUG] Running HDBSCAN clustering...", file=sys.stderr)
            print(f"  min_cluster_size: {min_cluster_size}", file=sys.stderr)
            print(f"  max_cluster_size: {max_cluster_size_param}", file=sys.stderr)
            print(f"  leaf_size: {leaf_size}", file=sys.stderr)

            # Build kwargs dynamically
            hdbscan_kwargs = {
                "min_cluster_size": min_cluster_size,
                "leaf_size": leaf_size,
                "prediction_data": True
            }

            if max_cluster_size_param:  # Only add if provided
                hdbscan_kwargs["max_cluster_size"] = int(max_cluster_size_param)

            model = hdbscan.HDBSCAN(**hdbscan_kwargs)

        else:
            return pd.DataFrame(), {"error": f"Unsupported clustering method '{method}'"}

        # Only fit model if not using silhouette-based KMeans
        if model:
            labels = model.fit_predict(X)

        # Log the output of the clustering
        print("[DEBUG] Clustering completed.", file=sys.stderr)
        print(f"  Number of data points: {len(labels)}", file=sys.stderr)

        unique_labels = set(labels)
        n_clusters_found = len(unique_labels - {-1})  # Exclude noise label (-1)
        n_noise = list(labels).count(-1)

        # print(f"  Unique labels: {unique_labels}", file=sys.stderr)
        print(f"  Clusters found (excluding noise): {n_clusters_found}", file=sys.stderr)
        print(f"  Noise points: {n_noise}", file=sys.stderr)

        # Optionally save in metrics dictionary
        metrics["n_clusters_found"] = n_clusters_found
        metrics["n_noise"] = n_noise


        df['cluster'] = labels.tolist()
        counts = df['cluster'].value_counts().to_dict()

        # Evaluation metrics
        silhouette_avg = silhouette_score(X, labels) if len(set(labels)) > 1 and len(X) > len(set(labels)) else None
        ari_score = adjusted_rand_score(df['individual_local_identifier'], labels) if 'individual_local_identifier' in df else None
        ch_score = calinski_harabasz_score(X, labels) if len(set(labels)) > 1 else None
        db_score = davies_bouldin_score(X, labels) if len(set(labels)) > 1 else None

        # Count noise points (label = -1), if any
        noise_ratio = (labels == -1).sum() / len(labels) if -1 in labels else 0

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
        # KK new added
        selected_years = params.get('selected_years')  # list of ints, e.g., [2021, 2022]
        selected_birds = params.get('selected_birds')  # list of bird IDs

    except json.JSONDecodeError:
        print(json.dumps({"error": "Invalid JSON in parameters"}))
        sys.exit(1)

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