import rasterio
from rasterio.transform import from_origin
from rasterio.features import rasterize
from rasterio.enums import Resampling
import numpy as np
import geopandas as gpd
import json
from shapely.geometry import Point
from pyproj import CRS

# Define the center point and area size
center_lat, center_lon = 51.454514, -2.587910
width_km, height_km = 1000, 1000  # Increased area size

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

# Define the grid resolution
width = 1000  # Increased grid width
height = 1000  # Increased grid height
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
    n_points = np.random.randint(50000, 60000)  # Increased range to match the larger area
    random_points = gpd.GeoDataFrame(
        geometry=[Point(np.random.uniform(xmin, xmax), np.random.uniform(ymin, ymax)) for _ in range(n_points)],
        crs=wgs84
    )

    # Buffer the points to create circular areas
    # Convert the buffer distance from km to degrees (approximate)
    buffer_km = np.random.uniform(0.01, 1.5)  # Keeping the buffer size consistent
    buffer_deg_lat = buffer_km / km_per_degree_lat
    buffer_deg_lon = buffer_km / km_per_degree_lon
    buffered_points = random_points.buffer(np.sqrt(buffer_deg_lat * buffer_deg_lon))

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
