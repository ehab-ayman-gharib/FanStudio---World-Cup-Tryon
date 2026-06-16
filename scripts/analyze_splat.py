import struct
import os
import glob

cache_dir = r"d:\Work\World-Cup-Kits-Tryon\FanStudio---World-Cup-Tryon\scripts\.splat_cache"
splat_files = glob.glob(os.path.join(cache_dir, "*.splat"))

for splat_path in splat_files[:5]:
    with open(splat_path, "rb") as f:
        data = f.read()
    
    n_points = len(data) // 32
    xs, ys, zs = [], [], []
    for i in range(min(n_points, 10000)):  # Read first 10k points
        offset = i * 32
        px, py, pz = struct.unpack_from("<fff", data, offset)
        xs.append(px)
        ys.append(py)
        zs.append(pz)
        
    centroid = [sum(xs)/len(xs), sum(ys)/len(ys), sum(zs)/len(zs)]
    print(f"File: {os.path.basename(splat_path)}")
    print(f"  Points: {n_points}")
    print(f"  Centroid: {centroid}")
    print(f"  Min: {[min(xs), min(ys), min(zs)]}")
    print(f"  Max: {[max(xs), max(ys), max(zs)]}")

