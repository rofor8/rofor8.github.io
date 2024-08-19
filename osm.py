import os
import requests
import geopandas as gpd
import rasterio
from rasterio.transform import from_origin
from rasterio.features import rasterize
from rasterio.enums import Resampling
import numpy as np
from shapely.geometry import box, LineString, Polygon, Point
import json

# Define the area of interest (1km x 1km)
center_lat, center_lon = 51.454514, -2.587910  # Bristol, UK
width_km, height_km = 1, 1

# Calculate the bounding box
km_per_degree_lat = 111.32
km_per_degree_lon = 111.32 * np.cos(np.radians(center_lat))

lat_offset = (height_km / 2) / km_per_degree_lat
lon_offset = (width_km / 2) / km_per_degree_lon

xmin = center_lon - lon_offset
ymin = center_lat - lat_offset
xmax = center_lon + lon_offset
ymax = center_lat + lat_offset

# Define the grid resolution (1m)
width = height = 1000
res = max((xmax - xmin) / width, (ymax - ymin) / height)

transform = from_origin(xmin, ymax, res, res)

# Load solution criteria
with open('solutionCriteria.json', 'r') as f:
    solution_criteria = json.load(f)

def download_osm_data(bbox):
    """Download OSM data for the given bounding box."""
    overpass_url = "http://overpass-api.de/api/interpreter"
    overpass_query = f"""
    [out:json];
    (
      way({bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]});
      relation({bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]});
    );
    out geom;
    """
    response = requests.get(overpass_url, params={'data': overpass_query})
    data = response.json()
    return data

def osm_to_geodataframe(osm_data):
    """Convert OSM data to a GeoDataFrame."""
    features = []
    print(f"Number of elements: {len(osm_data['elements'])}")
    for element in osm_data['elements']:
        print(f"Processing element: {element['type']}")
        if element['type'] == 'way':
            try:
                if 'geometry' in element:
                    coords = [(node['lon'], node['lat']) for node in element['geometry']]
                elif 'nodes' in element:
                    coords = [(node['lon'], node['lat']) for node in element['nodes']]
                else:
                    print(f"Unexpected element structure: {element.keys()}")
                    continue

                if len(coords) < 2:
                    print(f"Invalid geometry: {coords}")
                    continue

                if coords[0] == coords[-1]:
                    geometry = Polygon(coords)
                else:
                    geometry = LineString(coords)
                
                features.append({
                    'geometry': geometry,
                    'properties': element.get('tags', {})
                })
            except KeyError as e:
                print(f"KeyError in element: {e}")
                print(f"Element structure: {element.keys()}")
                continue
        elif element['type'] == 'node':
            try:
                geometry = Point(element['lon'], element['lat'])
                features.append({
                    'geometry': geometry,
                    'properties': element.get('tags', {})
                })
            except KeyError as e:
                print(f"KeyError in node element: {e}")
                print(f"Node element structure: {element.keys()}")
                continue

    if not features:
        print("No valid features found in the OSM data.")
        return gpd.GeoDataFrame(crs='EPSG:4326')
    
    print(f"Number of valid features: {len(features)}")
    return gpd.GeoDataFrame.from_features(features, crs='EPSG:4326')

def create_cog(data, output_path, transform):
    """Create a Cloud Optimized GeoTIFF."""
    profile = {
        'driver': 'GTiff',
        'dtype': rasterio.uint8,
        'count': 1,
        'width': data.shape[1],
        'height': data.shape[0],
        'crs': 'EPSG:4326',
        'transform': transform,
        'compress': 'lzw',
        'predictor': 2,
        'tiled': True,
        'blockxsize': 256,
        'blockysize': 256,
    }

    with rasterio.open(output_path, 'w', **profile) as dst:
        dst.write(data.astype(rasterio.uint8), 1)

    # Add overviews
    with rasterio.open(output_path, 'r+') as dst:
        factors = [2, 4, 8, 16]
        dst.build_overviews(factors, Resampling.average)
        dst.update_tags(ns='rio_overview', resampling='average')

def generate_raster(gdf, criterion):
    """Generate a raster based on the GeoDataFrame and criterion."""
    raster = np.zeros((height, width), dtype=np.uint8)
    
    # Filter GeoDataFrame based on criterion
    if criterion in ['soil permeability', 'soil type', 'soil quality']:
        filtered_gdf = gdf[gdf['natural'].isin(['heath', 'grassland', 'scrub'])]
    elif criterion in ['flood risk', 'urban runoff', 'water flow']:
        filtered_gdf = gdf[gdf['waterway'].notna() | gdf['natural'].isin(['water', 'wetland'])]
    elif criterion in ['building density', 'building height']:
        filtered_gdf = gdf[gdf['building'].notna()]
    elif criterion in ['rainfall']:
        # Simulate rainfall with random points
        points = gpd.GeoDataFrame(geometry=gpd.points_from_xy(
            np.random.uniform(xmin, xmax, 1000),
            np.random.uniform(ymin, ymax, 1000)
        ), crs='EPSG:4326')
        filtered_gdf = points
    elif criterion in ['air quality', 'urban heat island']:
        filtered_gdf = gdf[gdf['highway'].notna()]
    elif criterion in ['biodiversity index', 'habitat connectivity']:
        filtered_gdf = gdf[gdf['natural'].notna() | gdf['landuse'].isin(['forest', 'grass', 'meadow'])]
    elif criterion in ['population density', 'pedestrian flow']:
        filtered_gdf = gdf[gdf['highway'].isin(['pedestrian', 'footway', 'path'])]
    elif criterion in ['current road network']:
        filtered_gdf = gdf[gdf['highway'].notna()]
    elif criterion in ['sunlight exposure']:
        # Simulate sunlight exposure with a gradient
        xx, yy = np.mgrid[0:height, 0:width]
        filtered_gdf = gpd.GeoDataFrame(geometry=[box(xmin, ymin, xmax, ymax)], crs='EPSG:4326')
        raster = (xx + yy) / (height + width) * 255
    elif criterion in ['housing density', 'socioeconomic factors']:
        filtered_gdf = gdf[gdf['building'] == 'residential']
    elif criterion in ['land availability', 'accessibility']:
        filtered_gdf = gdf[gdf['landuse'].isin(['grass', 'meadow', 'recreation_ground'])]
    else:
        filtered_gdf = gdf
    
    if criterion != 'sunlight exposure':
        shapes = ((geom, 255) for geom in filtered_gdf.geometry)
        rasterize(shapes=shapes, out=raster, transform=transform, fill=0, all_touched=True)
    
    return raster

# Main execution
if __name__ == "__main__":
    # Ensure output directory exists
    os.makedirs('rasters', exist_ok=True)

    # Download OSM data
    bbox = (xmin, ymin, xmax, ymax)
    osm_data = download_osm_data(bbox)
    
    print("OSM data downloaded. Processing...")
    gdf = osm_to_geodataframe(osm_data)

    if gdf.empty:
        print("No data to process. Exiting.")
    else:
        print(f"GeoDataFrame created with {len(gdf)} features.")
        print(f"Columns: {gdf.columns}")
        print(f"Geometry types: {gdf.geometry.type.value_counts()}")

        # Generate and save COGs for each criterion
        all_criteria = set(criterion for criteria in solution_criteria.values() for criterion in criteria)

        for criterion in all_criteria:
            raster = generate_raster(gdf, criterion)
            output_path = f'rasters/{criterion}.tif'
            create_cog(raster, output_path, transform)
            print(f"Generated COG for {criterion}")

        print("All COGs generated successfully.")