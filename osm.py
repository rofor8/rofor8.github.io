import os
import requests
import geopandas as gpd
import rasterio
from rasterio.transform import from_origin
from rasterio.features import rasterize
from rasterio.enums import Resampling
import numpy as np
from shapely.geometry import box, LineString, Polygon, Point, MultiPolygon
from shapely.ops import unary_union
from shapely.validation import make_valid
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

import os
import requests
import geopandas as gpd
import rasterio
from rasterio.transform import from_origin
from rasterio.features import rasterize
from rasterio.enums import Resampling
import numpy as np
from shapely.geometry import box, LineString, Polygon, Point, MultiPolygon
from shapely.ops import unary_union
from shapely.validation import make_valid
import json
import random

# ... [Keep the existing imports and initial setup] ...

def download_osm_data(bbox):
    """Download OSM data for the given bounding box."""
    overpass_url = "http://overpass-api.de/api/interpreter"
    overpass_query = f"""
    [out:json];
    (
      node({bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]});
      way({bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]});
      relation({bbox[1]},{bbox[0]},{bbox[3]},{bbox[2]});
    );
    out geom;
    """
    response = requests.get(overpass_url, params={'data': overpass_query})
    data = response.json()
    return data

def osm_to_geodataframe(osm_data):
    """Convert OSM data to a GeoDataFrame with improved feature handling and error checking."""
    features = []
    for element in osm_data['elements']:
        try:
            if element['type'] == 'way':
                coords = [(node['lon'], node['lat']) for node in element['geometry']]
                geometry = Polygon(coords) if coords[0] == coords[-1] else LineString(coords)
            elif element['type'] == 'node':
                geometry = Point(element['lon'], element['lat'])
            elif element['type'] == 'relation':
                outer_rings = []
                inner_rings = []
                for member in element['members']:
                    if member['type'] == 'way':
                        coords = [(node['lon'], node['lat']) for node in member['geometry']]
                        try:
                            poly = Polygon(coords)
                            if member['role'] == 'outer':
                                outer_rings.append(poly)
                            elif member['role'] == 'inner':
                                inner_rings.append(poly)
                        except ValueError:
                            print(f"Invalid polygon: {coords}")
                            continue
                
                if outer_rings:
                    try:
                        geometry = unary_union(outer_rings)
                        for inner in inner_rings:
                            geometry = geometry.difference(inner)
                    except Exception as e:
                        print(f"Error creating multipolygon: {e}")
                        continue
                else:
                    continue  # Skip relations without outer rings
            
            if not geometry.is_valid:
                geometry = make_valid(geometry)
            
            features.append({
                'geometry': geometry,
                'properties': element.get('tags', {})
            })
        except Exception as e:
            print(f"Error processing element: {e}")
            continue

    if not features:
        print("No valid features found in the OSM data.")
        return gpd.GeoDataFrame(crs='EPSG:4326')
    
    return gpd.GeoDataFrame.from_features(features, crs='EPSG:4326')

def buffer_features(gdf, min_buffer=3, max_buffer=30):
    """Buffer features by a random distance between min_buffer and max_buffer meters."""
    buffer_distances = np.random.uniform(min_buffer, max_buffer, len(gdf))
    return gdf.to_crs('EPSG:3857').buffer(buffer_distances).to_crs('EPSG:4326')

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

    with rasterio.open(output_path, 'r+') as dst:
        factors = [2, 4, 8, 16]
        dst.build_overviews(factors, Resampling.average)
        dst.update_tags(ns='rio_overview', resampling='average')

def generate_raster(gdf, criterion):
    """Generate a raster based on the GeoDataFrame and criterion with randomized buffering."""
    raster = np.zeros((height, width), dtype=np.uint8)
    
    try:
        if criterion == 'buildings':
            filtered_gdf = gdf[gdf['building'].notna()]
        elif criterion == 'roads':
            filtered_gdf = gdf[gdf['highway'].notna()]
        elif criterion == 'water_bodies':
            filtered_gdf = gdf[gdf['natural'] == 'water']
        elif criterion == 'green_areas':
            filtered_gdf = gdf[gdf['landuse'].isin(['park', 'forest', 'grass', 'meadow']) | gdf['leisure'].isin(['park', 'garden'])]
        elif criterion == 'commercial_areas':
            filtered_gdf = gdf[(gdf['landuse'] == 'commercial') | (gdf['shop'].notna())]
        elif criterion == 'residential_areas':
            filtered_gdf = gdf[gdf['landuse'] == 'residential']
        elif criterion == 'industrial_areas':
            filtered_gdf = gdf[gdf['landuse'] == 'industrial']
        elif criterion == 'railways':
            filtered_gdf = gdf[gdf['railway'].notna()]
        elif criterion == 'waterways':
            filtered_gdf = gdf[gdf['waterway'].notna()]
        elif criterion == 'amenities':
            filtered_gdf = gdf[gdf['amenity'].notna()]
        elif criterion == 'natural_features':
            filtered_gdf = gdf[gdf['natural'].notna()]
        elif criterion == 'power_infrastructure':
            filtered_gdf = gdf[gdf['power'].notna()]
        else:
            filtered_gdf = gdf

        if not filtered_gdf.empty:
            filtered_gdf = filtered_gdf.copy()  # Create a copy to avoid SettingWithCopyWarning
            filtered_gdf['geometry'] = buffer_features(filtered_gdf)
            shapes = ((geom, 255) for geom in filtered_gdf.geometry)
            rasterize(shapes=shapes, out=raster, transform=transform, fill=0, all_touched=True)
        else:
            print(f"No features found for criterion: {criterion}")
    
    except Exception as e:
        print(f"Error processing criterion {criterion}: {str(e)}")
    
    return raster

# Main execution
if __name__ == "__main__":
    os.makedirs('rasters', exist_ok=True)

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

        # Define criteria based on OSM features
        criteria = [
            'buildings', 'roads', 'water_bodies', 'green_areas', 'commercial_areas',
            'residential_areas', 'industrial_areas', 'railways', 'waterways',
            'amenities', 'natural_features', 'power_infrastructure'
        ]

        for criterion in criteria:
            try:
                raster = generate_raster(gdf, criterion)
                if np.any(raster):  # Check if the raster contains any non-zero values
                    output_path = f'rasters/{criterion}.tif'
                    create_cog(raster, output_path, transform)
                    print(f"Generated COG for {criterion}")
                else:
                    print(f"Skipping empty raster for {criterion}")
            except Exception as e:
                print(f"Error generating raster for {criterion}: {str(e)}")

        print("All COGs generated successfully.")