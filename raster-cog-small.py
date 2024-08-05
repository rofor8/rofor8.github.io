import rasterio
from rasterio.transform import from_origin
from rasterio.features import rasterize
from rasterio.enums import Resampling  # Add this import
import numpy as np
import geopandas as gpd
import json
from shapely.geometry import Point, box
from pyproj import CRS

# Define the center point and area size
center_lat, center_lon = 51.454514, -2.587910
width_km, height_km = 10, 10

# Define the CRS (WGS84)
wgs84 = CRS('EPSG:4326')
# British National Grid
bng = CRS('EPSG:27700')

# Create a point and transform it to British National Grid
center_point = Point(center_lon, center_lat)
center_gdf = gpd.GeoDataFrame(geometry=[center_point], crs=wgs84)
center_bng = center_gdf.to_crs(bng)

# Get the coordinates of the center in BNG
center_x, center_y = center_bng.geometry.iloc[0].x, center_bng.geometry.iloc[0].y

# Define the bounding box
xmin = center_x - 5000  # 5km west
ymin = center_y - 5000  # 5km south
xmax = center_x + 5000  # 5km east
ymax = center_y + 5000  # 5km north

# Define the grid
width = 100
height = 100
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
        'crs': 'EPSG:27700',
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
    n_points = np.random.randint(5, 20)  # Random number of points between 5 and 20
    random_points = gpd.GeoDataFrame(
        geometry=[Point(np.random.uniform(xmin, xmax), np.random.uniform(ymin, ymax)) for _ in range(n_points)],
        crs=bng
    )

    # Buffer the points to create circular areas
    buffered_points = random_points.buffer(np.random.randint(500, 1000))  # Random radius between 100-500m

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