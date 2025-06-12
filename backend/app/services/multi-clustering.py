import psycopg2
import pandas as pd
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler
import folium
import matplotlib.colors as mcolors
import numpy as np
import time
from sklearn.metrics import silhouette_score, adjusted_rand_score

start_time = time.time()

# Connect to the PostgreSQL database
conn = psycopg2.connect(
    user='postgres',
    password='Firetrap77',
    host='localhost',
    port='5432',
    database='stork_migration_data'
)

# Set search_path to schema migration_data
cur = conn.cursor()
cur.execute('SET search_path TO migration_data;')

# Fetch data

### ALL BIRDS ###
cur.execute("""SELECT individual_local_identifier,
       location_lat_5dp, -- Latitude (rounded to 5 decimal places)
       location_long_5dp, -- Longitude (rounded to 5 decimal places)
       calculated_heading, -- Direction the bird is heading (in degrees)
       distance, -- Distance traveled by the bird
       --truncates the timestamp down to the nearest hour (removed mins & secs)
       date_trunc('hour', timestamp) +
       -- Extracts mins from timestamp & rounds down to the nearest 20-mins
       INTERVAL '1 minute' * (FLOOR(EXTRACT(MINUTE FROM timestamp) / 30) * 30) AS timestamp_5min
FROM stork_data
WHERE distance IS NOT NULL  -- Remove records where distance is null
  AND calculated_heading IS NOT NULL -- Remove records where heading is null
  AND NOT (calculated_heading = 0 AND distance = 0)
   -- Remove records where both distance and heading are zero (indicating no movement)
""")

rows = cur.fetchall()
columns = [desc[0] for desc in cur.description]
conn.close()

# Create a pandas dataframe
df = pd.DataFrame(rows, columns=columns)

# Check length of data before removing duplicates
print(f"Number of rows before removing duplicates: {len(df)}")

# Ensure the column is converted to float
df['location_lat_5dp'] = df['location_lat_5dp'].astype(float)
df['location_long_5dp'] = df['location_long_5dp'].astype(float)

# Define a variable for the desired precision level
decimal_places = 4  # Change this value to adjust precision (e.g., 3, 4, 5)

# Round latitude and longitude to the desired number of decimal places
df['location_lat_rounded'] = df['location_lat_5dp'].round(decimal_places)
df['location_long_rounded'] = df['location_long_5dp'].round(decimal_places)

# Remove duplicates
df_deduplicated = df.drop_duplicates(subset=['location_lat_rounded', 'location_long_rounded', 'timestamp_5min']).copy()

# Check length of data after removing duplicates
print(f"Number of rows after removing duplicates: {len(df_deduplicated)}")

# Debug output to verify the changes
print(f"Original rows: {len(df)}")
print(f"Rows after deduplication: {len(df_deduplicated)}")
print(f"Unique lat/long pairs: {df[['location_lat_rounded', 'location_long_rounded']].drop_duplicates().shape[0]}")

# Sample data
df_sampled = df_deduplicated.iloc[::10].copy()

# Check length of data after removing duplicates
print(f"Number of rows in sample: {len(df_sampled)}")


# Clustering function
def apply_clustering(data, method='kmeans', coords=None, true_labels=None, **kwargs):
    """
    Apply clustering and evaluate the results using Silhouette Score and Adjusted Rand Index (if true_labels are provided).

    Parameters:
    - data: DataFrame with latitude and longitude columns.
    - method: Clustering method ('kmeans', 'dbscan', 'hdbscan', etc.).
    - coords: Preprocessed coordinates (e.g., PCA-reduced data).
    - kwargs: Additional parameters for the clustering algorithm.

    Returns:
    - DataFrame with an additional 'cluster' column.
    - Clustering evaluation metrics.
    """
    if coords is None:
        coords = data[['location_lat_5dp', 'location_long_5dp']].astype(float)

    if method == 'kmeans':
        from sklearn.cluster import KMeans
        model = KMeans(n_clusters=kwargs.get('n_clusters', 10), random_state=0)

    elif method == 'dbscan':
        from sklearn.cluster import DBSCAN
        model = DBSCAN(eps=kwargs.get('eps', 0.01), min_samples=kwargs.get('min_samples', 5))

    elif method == 'hdbscan':
        import hdbscan
        model = hdbscan.HDBSCAN(
            min_cluster_size=kwargs.get('min_cluster_size', 10),
            min_samples=kwargs.get('min_samples', None),
            cluster_selection_epsilon=kwargs.get('cluster_selection_epsilon', 0.0),
            metric=kwargs.get('metric', 'euclidean')
        )
    elif method == 'agglomerative':
        from sklearn.cluster import AgglomerativeClustering
        model = AgglomerativeClustering(n_clusters=kwargs.get('n_clusters', 10))

    else:
        raise ValueError(f"Unsupported clustering method: {method}")

    # Fot and predict clusters
    data['cluster'] = model.fit_predict(coords)

    # Evaluate clustering quality using Silhouette Score
    silhouette_avg = silhouette_score(coords, data['cluster']) if len(set(data['cluster'])) > 1 else -1

    # If true_labels are provided, calculate Adjusted Rand Index
    ari_score = None
    if true_labels is not None:
        ari_score = adjusted_rand_score(true_labels, data['cluster'])

    return data, silhouette_avg, ari_score

###### CONFIRM CLUSTERING METHOD ########################

# Apply clustering (switch between 'kmeans' or 'dbscan')
clustering_method = 'hdbscan'  # Change to 'dbscan', 'kmeans', 'hdbscan', etc.
clustering_params = {'eps': 0.05, 'min_samples': 5} if clustering_method == 'dbscan' else {'n_clusters': 10}
# df_sampled = apply_clustering(df_sampled, method=clustering_method, **clustering_params)

df_sampled, silhouette_avg, ari_score = apply_clustering(df_sampled, method=clustering_method, **clustering_params)

# Handle noise points (cluster = -1)
print(f"Number of noise points (cluster = -1): {(df_sampled['cluster'] == -1).sum()}")

# Aggregate data
df_sampled['lat_rounded'] = df_sampled['location_lat_5dp'].astype(float).round(3)
df_sampled['long_rounded'] = df_sampled['location_long_5dp'].astype(float).round(3)
grouped = df_sampled.groupby(['lat_rounded', 'long_rounded']).agg(
    avg_heading=('calculated_heading', 'mean'),
    point_count=('calculated_heading', 'size')
).reset_index()
grouped = pd.merge(grouped, df_sampled[
    ['individual_local_identifier', 'lat_rounded', 'long_rounded', 'cluster']].drop_duplicates(),
                   on=['lat_rounded', 'long_rounded'], how='left')
grouped = grouped.dropna(subset=['avg_heading'])


# Calculate arrow endpoints
def calculate_arrow_end(lat, lon, heading, length=0.01):
    heading_rad = np.radians(heading)
    end_lat = lat + length * np.cos(heading_rad)
    end_lon = lon + length * np.sin(heading_rad)
    return end_lat, end_lon


grouped[['end_lat', 'end_long']] = grouped.apply(
    lambda row: pd.Series(calculate_arrow_end(row['lat_rounded'], row['long_rounded'], row['avg_heading'])),
    axis=1
)
grouped_cleaned = grouped.dropna(subset=['end_lat', 'end_long'])

# Visualize on map
avg_lat = df_sampled['location_lat_5dp'].astype(float).mean()
avg_long = df_sampled['location_long_5dp'].astype(float).mean()
map_folium = folium.Map(location=[avg_lat, avg_long], zoom_start=7, tiles=None, control_scale=True)
folium.TileLayer(tiles='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr='OpenStreetMap').add_to(map_folium)

# Set colors
colors = list(mcolors.TABLEAU_COLORS.values()) + list(mcolors.CSS4_COLORS.values())

# Add layers for each bird
bird_layers = {}
for bird in df_sampled['individual_local_identifier'].unique():
    bird_data = grouped_cleaned[grouped_cleaned['individual_local_identifier'] == bird]
    bird_layer = folium.FeatureGroup(name=bird)

    for _, row in bird_data.iterrows():
        locations = [(row['lat_rounded'], row['long_rounded']), (row['end_lat'], row['end_long'])]
        folium.PolyLine(locations=locations, color="blue", weight=row['point_count'] / 20, opacity=0.05).add_to(
            bird_layer)
        folium.CircleMarker(
            location=(row['lat_rounded'], row['long_rounded']),
            radius=3,
            color=colors[int(row['cluster']) % len(colors)],
            fill=True,
            fill_opacity=0.3
        ).add_to(bird_layer)

    bird_layers[bird] = bird_layer
    bird_layer.add_to(map_folium)

folium.LayerControl().add_to(map_folium)
file_map_name = f"MultiCluster_{clustering_method}_map"
map_folium.save(f"{file_map_name}.html")
print(f"The map is saved as '{file_map_name}.html'.")

end_time = time.time()
print(f"Script executed in: {end_time - start_time:.2f} seconds")