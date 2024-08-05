import rasterio
from rasterio.transform import from_origin
from rasterio.warp import calculate_default_transform, reproject, Resampling
import numpy as np
import geopandas as gpd
import json
from shapely.geometry import Point
from pyproj import CRS, Transformer
import noise

# Define the center point and area size
center_lat, center_lon = 51.454514, -2.587910
width_km, height_km = 100, 100

# Define the CRS (WGS84 and Web Mercator)
wgs84 = CRS('EPSG:4326')
web_mercator = CRS('EPSG:3857')

# Create a point and transform it to Web Mercator
center_point = Point(center_lon, center_lat)
center_gdf = gpd.GeoDataFrame(geometry=[center_point], crs=wgs84)
center_mercator = center_gdf.to_crs(web_mercator)

# Get the coordinates of the center in Web Mercator
center_x, center_y = center_mercator.geometry.iloc[0].x, center_mercator.geometry.iloc[0].y

# Define the bounding box in meters
xmin = center_x - 50000  # 50km west
ymin = center_y - 50000  # 50km south
xmax = center_x + 50000  # 50km east
ymax = center_y + 50000  # 50km north

# Define the grid
width = 1000
height = 1000
res = max((xmax - xmin) / width, (ymax - ymin) / height)

transform = from_origin(xmin, ymax, res, res)

# Load criteria
with open('solutionCriteria.json', 'r') as f:
    solution_criteria = json.load(f)

def create_cog(data, output_path, transform):
    """Create a Cloud Optimized GeoTIFF."""
    profile = {
        'driver': 'GTiff',
        'dtype': rasterio.float32,
        'count': 1,
        'width': data.shape[1],
        'height': data.shape[0],
        'crs': 'EPSG:3857',
        'transform': transform,
        'compress': 'lzw',
        'predictor': 3,
        'tiled': True,
        'blockxsize': 256,
        'blockysize': 256,
    }

    with rasterio.open(output_path, 'w', **profile) as dst:
        dst.write(data.astype(rasterio.float32), 1)

    # Add overviews
    with rasterio.open(output_path, 'r+') as dst:
        factors = [2, 4, 8, 16]
        dst.build_overviews(factors, Resampling.average)
        dst.update_tags(ns='rio_overview', resampling='average')

def generate_raster(criterion):
    scale = 100.0
    octaves = 6
    persistence = 0.5
    lacunarity = 2.0
    
    raster = np.zeros((height, width), dtype=np.float32)
    
    for y in range(height):
        for x in range(width):
            raster[y][x] = noise.pnoise2(x/scale, 
                                         y/scale, 
                                         octaves=octaves, 
                                         persistence=persistence, 
                                         lacunarity=lacunarity, 
                                         repeatx=1024, 
                                         repeaty=1024, 
                                         base=np.random.randint(0, 1000))
    
    # Normalize to 0-1 range
    raster = (raster - raster.min()) / (raster.max() - raster.min())
    
    # Apply threshold
    threshold = np.random.uniform(0.4, 0.8)
    binary = (raster > threshold).astype(np.float32)
    
    return binary

# Generate and save COGs for each criterion
all_criteria = set(criterion for criteria in solution_criteria.values() for criterion in criteria)

for criterion in all_criteria:
    raster = generate_raster(criterion)
    output_path = f'rasters/{criterion}.tif'
    create_cog(raster, output_path, transform)
    print(f"Generated COG for {criterion}")

print("All COGs generated successfully.")

# Debug information
print(f"Area covered: {(xmax - xmin) / 1000}km x {(ymax - ymin) / 1000}km")
print(f"Pixel resolution: {res}m")
print(f"Web Mercator coordinates of center: ({center_x}, {center_y})")
print(f"Bounding box: ({xmin}, {ymin}, {xmax}, {ymax})")