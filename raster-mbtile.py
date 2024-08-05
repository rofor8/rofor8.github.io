import json
import numpy as np
import mercantile
import mapbox_vector_tile
import sqlite3
import os

def generate_binary_raster(width, height, seed):
    np.random.seed(seed)
    raster = np.zeros((height, width), dtype=np.uint8)
    num_shapes = 5 + np.random.randint(5)
    
    for _ in range(num_shapes):
        center_x = np.random.randint(width)
        center_y = np.random.randint(height)
        max_radius = min(20, min(width, height) // 5)
        radius = 5 + np.random.randint(max_radius)
        
        y, x = np.ogrid[-radius:radius+1, -radius:radius+1]
        mask = x**2 + y**2 <= radius**2
        
        raster[
            max(0, center_y-radius):min(height, center_y+radius+1),
            max(0, center_x-radius):min(width, center_x+radius+1)
        ][mask[
            :min(height, center_y+radius+1) - max(0, center_y-radius),
            :min(width, center_x+radius+1) - max(0, center_x-radius)
        ]] = 255
    
    return raster

def raster_to_mbtiles(raster, criterion, zoom_levels=[0, 1, 2, 3, 4]):
    conn = sqlite3.connect(f'rasters/{criterion}.mbtiles')
    conn.execute('''CREATE TABLE IF NOT EXISTS tiles
                    (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)''')
    conn.execute('''CREATE UNIQUE INDEX IF NOT EXISTS tile_index ON tiles
                    (zoom_level, tile_column, tile_row)''')

    for zoom in zoom_levels:
        for x in range(2**zoom):
            for y in range(2**zoom):
                tile = mercantile.Tile(x, y, zoom)
                bounds = mercantile.bounds(tile)
                
                # Calculate the portion of the raster that falls within this tile
                left = int((bounds.west + 180) / 360 * raster.shape[1])
                right = int((bounds.east + 180) / 360 * raster.shape[1])
                top = int((90 - bounds.north) / 180 * raster.shape[0])
                bottom = int((90 - bounds.south) / 180 * raster.shape[0])
                
                tile_data = raster[top:bottom, left:right]
                
                if np.any(tile_data):
                    # Convert the tile data to a vector tile
                    features = []
                    for value in np.unique(tile_data):
                        if value != 0:
                            mask = tile_data == value
                            features.append({
                                'geometry': {
                                    'type': 'Polygon',
                                    'coordinates': [[[0, 0], [0, mask.shape[0]], [mask.shape[1], mask.shape[0]], [mask.shape[1], 0], [0, 0]]]
                                },
                                'properties': {'value': int(value)}
                            })
                    
                    vector_tile = mapbox_vector_tile.encode([{
                        'name': 'raster',
                        'features': features
                    }])
                    
                    conn.execute('INSERT OR REPLACE INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)',
                                 (zoom, x, y, sqlite3.Binary(vector_tile)))

    conn.commit()
    conn.close()


def create_metadata(conn, criterion):
    metadata = {
        "name": criterion,
        "type": "overlay",
        "version": 1,
        "description": f"Raster data for {criterion}",
        "format": "pbf",
        "minzoom": 0,
        "maxzoom": 4,
        "bounds": "-180,-90,180,90"
    }
    
    conn.execute('CREATE TABLE IF NOT EXISTS metadata (name TEXT, value TEXT)')
    for key, value in metadata.items():
        conn.execute('INSERT INTO metadata (name, value) VALUES (?, ?)', (key, str(value)))

# Load solution criteria
with open('solutionCriteria.json', 'r') as f:
    solution_criteria = json.load(f)

# Create a directory to store the rasters
os.makedirs('rasters', exist_ok=True)

# Generate and save rasters for each criterion
for index, criterion in enumerate(set(criterion for criteria in solution_criteria.values() for criterion in criteria)):
    raster = generate_binary_raster(100, 100, index)
    raster_to_mbtiles(raster, criterion)
    
    # Add metadata to the MBTiles file
    conn = sqlite3.connect(f'rasters/{criterion}.mbtiles')
    create_metadata(conn, criterion)
    conn.commit()
    conn.close()

print("MBTiles generation complete.")