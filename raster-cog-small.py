import rasterio
from rasterio.transform import from_origin
from rasterio.features import rasterize
from rasterio.enums import Resampling
import numpy as np
import geopandas as gpd
import json
from shapely.geometry import Point, box
from pyproj import CRS

# Define the center point and area size
center_lat, center_lon = 51.454514, -2.587910
width_km, height_km = 500, 500  # Updated to 500km by 500km

# Define the CRS (WGS84)
wgs84 = CRS('EPSG:4326')

# Calculate the bounding box in degrees
# Approximate degree to km conversion at this latitude
km_per_degree_lat = 111.32
km_per_degree_lon = 111.32 * np.cos(np.radians(center_lat))

lat_offset = (height_km / 2) / km_per_degree_lat
lon_offset = (width_km / 2) / km_per_degree_lon

xmin = center_lon - lon_offset
ymin = center_lat - lat_offset
xmax = center_lon + lon_offset
ymax = center_lat + lat_offset

# Define the grid
width = 500  # Updated to match the new area size
height = 500  # Updated to match the new area size
res = max((xmax - xmin) / width, (ymax - ymin) / height)

transform = from_origin(xmin, ymax, res, res)

# Load criteria
with open('solutionCriteria.json', 'r') as f:
    solution_criteria = json.load(f)

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

def generate_raster(criterion):
    # Create an empty raster
    raster = np.zeros((height, width), dtype=np.uint8)

    # Generate random points within the bounding box
    n_points = np.random.randint(55, 200)  # Random number of points between 55 and 200
    random_points = gpd.GeoDataFrame(
        geometry=[Point(np.random.uniform(xmin, xmax), np.random.uniform(ymin, ymax)) for _ in range(n_points)],
        crs=wgs84
    )

    # Re-project to a projected CRS (e.g., UTM Zone 30N for the given area)
    utm_crs = CRS('EPSG:32630')
    random_points_utm = random_points.to_crs(utm_crs)

    # Buffer the points to create circular areas
    buffer_km = np.random.uniform(1, 7.0)  # Random radius between 1 and 7 km
    buffer_distance = buffer_km * 1000  # Convert km to meters
    buffered_points_utm = random_points_utm.buffer(buffer_distance)

    # Re-project back to the original CRS
    buffered_points = buffered_points_utm.to_crs(wgs84)

    # Rasterize the buffered points
    shapes = ((geom, 1) for geom in buffered_points.geometry)
    rasterize(shapes=shapes, out=raster, transform=transform)

    return raster

# Generate and save COGs for each criterion
all_criteria = set(criterion for criteria in solution_criteria.values() for criterion in criteria)

for criterion in all_criteria:
    raster = generate_raster(criterion)
    output_path = f'rasters/{criterion}.tif'
    create_cog(raster, output_path, transform)
    print(f"Generated COG for {criterion}")

print("All COGs generated successfully.")
