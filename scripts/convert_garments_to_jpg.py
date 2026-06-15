import os
from PIL import Image

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GARMENTS_DIR = os.path.join(ROOT_DIR, "public", "garments")

def convert_garments():
    if not os.path.exists(GARMENTS_DIR):
        print(f"Directory not found: {GARMENTS_DIR}")
        return

    print(f"Scanning directory: {GARMENTS_DIR}")
    for filename in os.listdir(GARMENTS_DIR):
        name, ext = os.path.splitext(filename)
        ext = ext.lower()
        if ext in ('.png', '.webp', '.jpeg', '.jpg'):
            img_path = os.path.join(GARMENTS_DIR, filename)
            dest_filename = f"{name}.jpg"
            dest_path = os.path.join(GARMENTS_DIR, dest_filename)
            
            try:
                print(f"Converting {filename}...")
                with Image.open(img_path) as img:
                    # Composite transparent images over solid white background
                    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                        # Create white background image
                        background = Image.new("RGB", img.size, (255, 255, 255))
                        # Paste the image on top using alpha mask
                        background.paste(img, (0, 0), img.convert("RGBA"))
                        img_to_save = background
                    else:
                        img_to_save = img.convert("RGB")
                    
                    # Save as JPEG with quality=90
                    img_to_save.save(dest_path, "JPEG", quality=90)
                
                # Delete the old file if it wasn't already a .jpg
                if ext != '.jpg' and ext != '.jpeg':
                    os.remove(img_path)
                    print(f"Deleted original {filename}")
                elif ext == '.jpeg':
                    os.remove(img_path)
                    print(f"Renamed .jpeg to .jpg")
            except Exception as e:
                print(f"Failed to convert {filename}: {e}")

if __name__ == "__main__":
    convert_garments()
