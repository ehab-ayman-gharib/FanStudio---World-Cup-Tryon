import os
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

# Define targets and headers
SERIES_BASE_URL = "https://brandlogos.net/series/2026-fifa-world-cup-teams"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

# The list of team IDs we want to match against
TEAMS = [
    "algeria", "argentina", "australia", "austria", "belgium", "bosnia", 
    "brazil", "canada", "cape-verde", "colombia", "congo", "croatia", 
    "curacao", "czech", "ecuador", "egypt", "england", "france", 
    "germany", "ghana", "haiti", "iran", "iraq", "japan", "jordan", 
    "korea", "mexico", "morocco", "netherlands", "new-zealand", "norway", 
    "panama", "paraguay", "cote-d-ivoire", "portugal", "saudi-arabia", "scotland", 
    "qatar", "south-africa", "spain", "sweden", "switzerland", 
    "tunisia", "turkey", "usa", "uruguay", "senegal", "uzbekistan"
]


# Create output directories
os.makedirs("public/logos", exist_ok=True)

def slugify(text):
    text = text.lower()
    text = re.sub(r'[^a-z0-9]+', '-', text)
    return text.strip('-')

def get_best_match(logo_name):
    """
    Find which team ID matches the logo name best.
    """
    logo_slug = slugify(logo_name)
    
    # Direct matches
    for team in TEAMS:
        if team == logo_slug:
            return team
            
    # Substring matches (e.g. "england-national-football-team" contains "england")
    for team in TEAMS:
        if team in logo_slug:
            return team
            
    # Fuzzy mapping/Special cases
    special_mappings = {
        "south-korea": "korea",
        "czech-republic": "czech",
        "united-states": "usa",
        "us-national": "usa",
        "saudi": "saudi-arabia",
        "cape": "cape-verde",
        "new-zealand": "new-zealand",
        "south-africa": "south-africa",
        "congo-dr": "congo",
        "ivory-coast": "cote-d-ivoire",
        "cote-d-ivoire": "cote-d-ivoire",
        "cote-divoire": "cote-d-ivoire",
        "cote-d-voire": "cote-d-ivoire",
        "solvenia": "slovenia",
    }
    
    for key, value in special_mappings.items():
        if key in logo_slug:
            return value
            
    return None


def find_logo_image(detail_soup, team_match):
    """
    Scoring algorithm to find the main logo image on the detail page
    while avoiding headers, sidebars, and generic site assets.
    """
    # 1. Narrow down content area if possible
    main_content = (
        detail_soup.find("main") or 
        detail_soup.find("article") or 
        detail_soup.find("div", id="content") or 
        detail_soup.find("div", class_="entry-content") or 
        detail_soup
    )
    
    candidates = []
    for img in main_content.find_all("img"):
        src = img.get("src", "")
        if not src:
            continue
            
        # Exclude common theme/plugin assets and site-wide logo placeholders
        if "wp-content/themes" in src or "logo-site" in src or "brandlogos-logo" in src.lower():
            continue
            
        # Real logo images are always in the WordPress uploads directory
        if "wp-content/uploads" not in src:
            continue
            
        score = 0
        src_lower = src.lower()
        
        # Score based on how well the image source matches the team ID
        keywords = team_match.split("-")
        for kw in keywords:
            if kw in src_lower:
                score += 10
                
        # Plus point if it contains "logo"
        if "logo" in src_lower:
            score += 2
            
        # Minus point if it's the general 2026 FIFA World Cup series logo
        if "2026-fifa-world-cup" in src_lower:
            score -= 5
            
        # Ignore extremely small icons (social or other things)
        width = img.get("width")
        height = img.get("height")
        if width and height:
            try:
                if int(width) < 80 or int(height) < 80:
                    score -= 15
            except ValueError:
                pass
                
        candidates.append((score, src))
        
    if candidates:
        # Sort by score descending
        candidates.sort(key=lambda x: x[0], reverse=True)
        best_score, best_src = candidates[0]
        # Return best candidate if it has a positive score
        if best_score > 0:
            return best_src
            
    return None

def fetch_logos():
    print(f"Fetching series page: {SERIES_BASE_URL}")
    pages_to_scrape = [SERIES_BASE_URL]
    
    # Pre-populate pages 2 and 3 as standard fallbacks
    for page_num in [2, 3]:
        p_url = f"{SERIES_BASE_URL}/page/{page_num}"
        if p_url not in pages_to_scrape:
            pages_to_scrape.append(p_url)
            
    # Also attempt to dynamically discover other pages just in case
    try:
        response = requests.get(SERIES_BASE_URL, headers=HEADERS, timeout=20)
        if response.status_code == 200:
            soup = BeautifulSoup(response.text, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"]
                if "/series/2026-fifa-world-cup-teams/page/" in href:
                    href = urljoin(SERIES_BASE_URL, href)
                    # Clean trailing slashes to avoid duplicates
                    href = href.rstrip('/')
                    if href not in pages_to_scrape:
                        pages_to_scrape.append(href)
    except Exception as e:
        print(f"Network error during pagination detection: {e}")


    print(f"Found pages to scrape: {pages_to_scrape}")
    
    # 2. Collect all detail page links across all pages
    detail_links = set()
    for page_url in pages_to_scrape:
        print(f"Scanning page: {page_url}")
        try:
            r = requests.get(page_url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                p_soup = BeautifulSoup(r.text, "html.parser")
                for a in p_soup.find_all("a", href=True):
                    href = a["href"]
                    # Matches detail pages (e.g. brandlogos.net/some-slug-12345.html)
                    if re.search(r"brandlogos\.net/[^/]+-\d+\.html$", href):
                        detail_links.add(href)
        except Exception as e:
            print(f"Error scanning page {page_url}: {e}")
            
    print(f"Found {len(detail_links)} candidate logo detail pages in total.")
    
    results = {}
    
    # 3. Visit each detail page and download the logo
    for idx, url in enumerate(sorted(detail_links), 1):
        parsed_url = urlparse(url)
        logo_filename = parsed_url.path.split('/')[-1]
        # Clean logo name for team matching
        logo_name = (logo_filename
                     .replace('-logo-vector-', ' ')
                     .replace('-vector-logo-', ' ')
                     .replace('.html', '')
                     .replace('-', ' '))
        
        team_match = get_best_match(logo_name)
        if not team_match:
            print(f"[{idx}/{len(detail_links)}] No matching team for logo name: '{logo_name}' ({url})")
            continue
            
        print(f"[{idx}/{len(detail_links)}] Processing logo for team '{team_match}' from: {url}")
        
        try:
            detail_resp = requests.get(url, headers=HEADERS, timeout=15)
            if detail_resp.status_code != 200:
                print(f"  Failed to fetch detail page: {url}")
                continue
                
            detail_soup = BeautifulSoup(detail_resp.text, "html.parser")
            logo_img_url = find_logo_image(detail_soup, team_match)
            
            if logo_img_url:
                logo_img_url = urljoin(url, logo_img_url)
                print(f"  Found logo image URL: {logo_img_url}")
                
                # Download and save the image
                img_resp = requests.get(logo_img_url, headers=HEADERS, timeout=15)
                if img_resp.status_code == 200:
                    # Get extension (default to .png)
                    ext = ".png"
                    if ".jpg" in logo_img_url.lower() or ".jpeg" in logo_img_url.lower():
                        ext = ".jpg"
                    elif ".webp" in logo_img_url.lower():
                        ext = ".webp"
                    elif ".svg" in logo_img_url.lower():
                        ext = ".svg"
                        
                    output_path = f"public/logos/{team_match}{ext}"
                    with open(output_path, "wb") as f:
                        f.write(img_resp.content)
                    print(f"  Successfully saved logo to {output_path}")
                    results[team_match] = output_path
                else:
                    print(f"  Failed to download image from {logo_img_url}")
            else:
                print(f"  Could not locate logo image tag on page {url}")
                
        except Exception as e:
            print(f"  Error processing {url}: {e}")
            
    print("\nExtraction Complete!")
    print(f"Downloaded {len(results)} team logos:")
    for team, path in results.items():
        print(f"- {team}: {path}")
        
    missing = [t for t in TEAMS if t not in results]
    if missing:
        print(f"\nMissing {len(missing)} teams: {', '.join(missing)}")

if __name__ == "__main__":
    fetch_logos()
