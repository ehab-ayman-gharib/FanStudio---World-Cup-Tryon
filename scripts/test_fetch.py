import requests
from bs4 import BeautifulSoup
import json

url = "https://brandlogos.net/series/2026-fifa-world-cup-teams"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

try:
    response = requests.get(url, headers=headers, timeout=15)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 200:
        soup = BeautifulSoup(response.text, 'html.parser')
        # Print first 1000 characters of HTML to see structure, or search for logo classes/tags
        links = []
        for a in soup.find_all('a'):
            href = a.get('href', '')
            if 'logo' in href or 'vector' in href:
                links.append((a.text.strip(), href))
        print(f"Found {len(links)} links related to logo/vector:")
        for text, href in links[:20]:
            print(f"- {text}: {href}")
    else:
        print(response.text[:500])
except Exception as e:
    print(f"Error: {e}")
