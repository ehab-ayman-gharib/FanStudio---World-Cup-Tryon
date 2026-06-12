import os
import shutil

src_dir = "Kits References"
dest_dir = "public/kits"

if os.path.exists(src_dir):
    print(f"Copying kit reference images from '{src_dir}' to '{dest_dir}'...")
    os.makedirs(dest_dir, exist_ok=True)
    for filename in os.listdir(src_dir):
        src_path = os.path.join(src_dir, filename)
        dest_path = os.path.join(dest_dir, filename)
        if os.path.isfile(src_path):
            shutil.copy2(src_path, dest_path)
    print("Successfully copied all kit reference images!")
else:
    print(f"Error: '{src_dir}' directory not found.")
