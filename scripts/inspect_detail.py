import requests
from bs4 import BeautifulSoup

url = "https://brandlogos.net/england-national-football-team-logo-vector-74105.html"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

resp = requests.get(url, headers=headers)
print("Status:", resp.status_code)
soup = BeautifulSoup(resp.text, 'html.parser')

print("\n--- All Images ---")
for idx, img in enumerate(soup.find_all('img')):
    print(f"Img {idx}: src={img.get('src')}, class={img.get('class')}, alt={img.get('alt')}")

print("\n--- Checking container classes ---")
for tag in soup.find_all(class_=True):
    classes = tag.get('class')
    if any(c in ' '.join(classes) for c in ['logo-image', 'logo-box', 'logo-holder', 'logo-preview']):
        print(f"Tag: {tag.name}, class: {classes}")
        img = tag.find('img')
        if img:
            print(f"  Contains Img: src={img.get('src')}")
