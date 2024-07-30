import numpy as np
from PIL import Image
import os

def create_clustered_raster(size, num_clusters):
    data = np.zeros((size, size), dtype=np.uint8)
    for _ in range(num_clusters):
        center_x, center_y = np.random.randint(0, size, 2)
        cluster_size = np.random.randint(size // 10, size // 4)
        value = np.random.randint(1, 10)
        for x in range(max(0, center_x - cluster_size), min(size, center_x + cluster_size)):
            for y in range(max(0, center_y - cluster_size), min(size, center_y + cluster_size)):
                if np.random.random() < 0.7:  # 70% chance to fill
                    data[x, y] = value
    return data

def save_raster(data, filename):
    img = Image.fromarray(data, mode='L')
    img.save(filename)

# Create directory for rasters if it doesn't exist
os.makedirs('rasters', exist_ok=True)

# Generate 5 criteria rasters
for i in range(5):
    raster_data = create_clustered_raster(256, 10)
    save_raster(raster_data, f'rasters/criteria{i+1}.png')

print("Raster files created successfully.")