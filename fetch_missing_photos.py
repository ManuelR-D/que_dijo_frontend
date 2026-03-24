"""Fetch photos from Wikipedia for senators missing photos in legislators_{year}.json.
Downloads to public/fotos/ and updates legislators_{year}.json.
"""
import argparse
import hashlib
import json
import re
import time
import unicodedata
from pathlib import Path
from urllib.parse import quote

import requests

OUTPUT_DIR = Path(__file__).resolve().parent / "public" / "data"
FOTOS_DIR = Path(__file__).resolve().parent / "public" / "fotos"

WIKI_ES_API = "https://es.wikipedia.org/w/api.php"
WIKI_EN_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
WIKI_THUMB_SIZE = 300

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "CandidatosBot/1.0 (photo lookup)"})


def search_wikipedia_photo(name: str) -> str | None:
    """Search Wikipedia for a senator's photo URL."""
    if "," in name:
        parts = name.split(",", 1)
        lastname = parts[0].strip().title()
        firstname = parts[1].strip().title() if len(parts) > 1 else ""
        search_name = f"{firstname} {lastname}".strip()
    else:
        search_name = name.strip().title()

    query = f"{search_name} senador Argentina"

    # Try Spanish Wikipedia
    url = _search_wiki(query, WIKI_ES_API)
    if url:
        return url

    # Try English Wikipedia
    url = _search_wiki(query, WIKI_EN_API)
    if url:
        return url

    # Try Wikidata
    return _search_wikidata(search_name)


def _search_wiki(query: str, api_base: str) -> str | None:
    search_params = {
        "action": "query",
        "list": "search",
        "srsearch": query,
        "format": "json",
        "srlimit": 3,
        "srprop": "snippet",
    }
    try:
        time.sleep(0.3)
        resp = SESSION.get(api_base, params=search_params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, json.JSONDecodeError, ValueError):
        return None

    results = data.get("query", {}).get("search", [])
    if not results:
        return None

    political_kw = [
        "diputad", "senad", "legislad", "polític", "politic",
        "congres", "cámara", "bloque", "partido",
    ]

    for i, result in enumerate(results):
        title = result.get("title", "")
        if not title:
            continue

        snippet = result.get("snippet", "").lower()
        if i > 0 and not any(kw in snippet for kw in political_kw):
            continue

        img_params = {
            "action": "query",
            "titles": title,
            "prop": "pageimages",
            "format": "json",
            "pithumbsize": WIKI_THUMB_SIZE,
        }
        try:
            time.sleep(0.2)
            resp = SESSION.get(api_base, params=img_params, timeout=15)
            resp.raise_for_status()
            img_data = resp.json()
        except (requests.RequestException, json.JSONDecodeError, ValueError):
            continue

        pages = img_data.get("query", {}).get("pages", {})
        for page_info in pages.values():
            thumb = page_info.get("thumbnail", {})
            source = thumb.get("source", "")
            if source:
                return source

    return None


def _search_wikidata(search_name: str) -> str | None:
    search_params = {
        "action": "wbsearchentities",
        "search": search_name,
        "language": "es",
        "format": "json",
        "limit": 3,
        "type": "item",
    }
    try:
        time.sleep(0.3)
        resp = SESSION.get(WIKIDATA_API, params=search_params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, json.JSONDecodeError, ValueError):
        return None

    for entity in data.get("search", []):
        entity_id = entity.get("id", "")
        if not entity_id:
            continue

        claims_params = {
            "action": "wbgetclaims",
            "entity": entity_id,
            "property": "P18",
            "format": "json",
        }
        try:
            time.sleep(0.2)
            resp = SESSION.get(WIKIDATA_API, params=claims_params, timeout=15)
            resp.raise_for_status()
            claims_data = resp.json()
        except (requests.RequestException, json.JSONDecodeError, ValueError):
            continue

        claims = claims_data.get("claims", {}).get("P18", [])
        if not claims:
            continue

        try:
            image_name = claims[0]["mainsnak"]["datavalue"]["value"]
        except (KeyError, IndexError):
            continue

        if image_name:
            safe_name = image_name.replace(" ", "_")
            md5 = hashlib.md5(safe_name.encode("utf-8")).hexdigest()
            encoded_name = quote(safe_name)
            thumb_url = (
                f"https://upload.wikimedia.org/wikipedia/commons/thumb/"
                f"{md5[0]}/{md5[:2]}/{encoded_name}/"
                f"{WIKI_THUMB_SIZE}px-{encoded_name}"
            )
            if safe_name.lower().endswith(".svg"):
                thumb_url += ".jpg"
            return thumb_url

    return None


def safe_filename(name: str) -> str:
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_name = nfkd.encode("ascii", "ignore").decode("ascii")
    safe = re.sub(r"[^a-zA-Z0-9]+", "_", ascii_name).strip("_").lower()
    if len(safe) > 40:
        safe = safe[:40]
    name_hash = hashlib.md5(name.encode("utf-8")).hexdigest()[:6]
    return f"wiki_{safe}_{name_hash}"


def download_photo(url: str, filename: str) -> bool:
    dest = FOTOS_DIR / filename
    try:
        resp = SESSION.get(url, timeout=30, stream=True)
        resp.raise_for_status()
        content_type = resp.headers.get("content-type", "")
        if "image" not in content_type and "octet" not in content_type:
            return False
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
        if dest.stat().st_size < 500:
            dest.unlink()
            return False
        return True
    except (requests.RequestException, OSError):
        if dest.exists():
            dest.unlink()
        return False


def main(year: int):
    legs_path = OUTPUT_DIR / f"legislators_{year}.json"
    legs = json.loads(legs_path.read_text(encoding="utf-8"))

    missing = {sid: data for sid, data in legs.items() if not data.get("imageUrl")}
    print(f"{len(missing)} senators without photos:")
    for sid, data in missing.items():
        print(f"  {sid}: {data['name']}")

    FOTOS_DIR.mkdir(parents=True, exist_ok=True)
    found = 0

    for sid, data in missing.items():
        name = data["name"]
        print(f"\nSearching photo for {name}...")

        photo_url = search_wikipedia_photo(name)
        if not photo_url:
            print(f"  ✗ No photo found")
            continue

        print(f"  Found: {photo_url[:80]}...")
        fname = safe_filename(name)

        # Determine extension from URL
        if ".jpg" in photo_url.lower() or ".jpeg" in photo_url.lower():
            ext = ".jpg"
        elif ".png" in photo_url.lower():
            ext = ".png"
        elif ".gif" in photo_url.lower():
            ext = ".gif"
        else:
            ext = ".jpg"

        filename = f"{fname}{ext}"
        if download_photo(photo_url, filename):
            legs[sid]["imageUrl"] = f"fotos/{filename}"
            print(f"  ✓ Downloaded: {filename}")
            found += 1
        else:
            print(f"  ✗ Download failed")

    print(f"\n{'='*50}")
    print(f"Found {found}/{len(missing)} photos")

    if found > 0:
        legs_path.write_text(json.dumps(legs, ensure_ascii=False), encoding="utf-8")
        print(f"Updated {legs_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch missing photos for que_dijo")
    parser.add_argument("--year", type=int, required=True, help="Year to process (e.g. 2025, 2026)")
    args = parser.parse_args()
    main(args.year)
