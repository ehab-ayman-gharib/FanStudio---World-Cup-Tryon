import struct
import os

splat_path = r"d:\Work\World-Cup-Kits-Tryon\FanStudio - World Cup 2026\scripts\.splat_cache\sharp_1781225113936.splat"

if os.path.exists(splat_path):
    with open(splat_path, "rb") as f:
        data = f.read()
    
    n_points = len(data) // 32
    print("Num points:", n_points)
    
    xs, ys, zs = [], [], []
    for i in range(min(n_points, 100000)):  # Sample or read all
        offset = i * 32
        px, py, pz = struct.unpack_from("<fff", data, offset)
        xs.append(px)
        ys.append(py)
        zs.append(pz)
        
    centroid = [sum(xs)/len(xs), sum(ys)/len(ys), sum(zs)/len(zs)]
    print("Centroid (first 100k):", centroid)
    print("Min:", [min(xs), min(ys), min(zs)])
    print("Max:", [max(xs), max(ys), max(zs)])
else:
    print("File not found")
