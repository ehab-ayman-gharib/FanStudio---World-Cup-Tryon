import requests
from bs4 import BeautifulSoup

url = "https://brandlogos.net/series/2026-fifa-world-cup-teams"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

resp = requests.get(url, headers=headers)
print("Status:", resp.status_code)
if resp.status_code == 200:
    soup = BeautifulSoup(resp.text, 'html.parser')
    
    print("\n--- All Links in Page ---")
    links = []
    for idx, a in enumerate(soup.find_all('a', href=True)):
        href = a['href']
        text = a.text.strip()
        links.append((text, href))
        
    print(f"Total links found: {len(links)}")
    # Print the first 50 links
    for idx, (text, href) in enumerate(links[:100]):
        print(f"{idx}: text='{text}', href='{href}'")
else:
    print(resp.text[:1000])
