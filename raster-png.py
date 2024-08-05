import json
import numpy as np
from PIL import Image
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

# Load solution criteria
with open('solutionCriteria.json', 'r') as f:
    solution_criteria = json.load(f)

# Create a directory to store the rasters
os.makedirs('rasters', exist_ok=True)

# Generate and save rasters for each criterion
for index, criterion in enumerate(set(criterion for criteria in solution_criteria.values() for criterion in criteria)):
    raster = generate_binary_raster(100, 100, index)
    img = Image.fromarray(raster, 'L')
    img.save(f'rasters/{criterion}.png')

print("Raster generation complete.")