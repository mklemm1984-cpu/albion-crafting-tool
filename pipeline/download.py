"""Downloads and locally caches the two large ao-bin-dumps JSON files the
recipe pipeline depends on. Both are big (items.json ~17MB, formatted/
items.json ~23MB) so they are only re-downloaded when refresh=True."""

from __future__ import annotations

import json
import pathlib
import sys

import requests

CACHE_DIR = pathlib.Path(__file__).parent / ".cache"
ITEMS_URL = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json"
NAMES_URL = "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json"


def _cached_or_download(url: str, cache_name: str, refresh: bool, cache_dir: pathlib.Path):
    cache_dir.mkdir(exist_ok=True, parents=True)
    cache_path = cache_dir / cache_name
    if cache_path.exists() and not refresh:
        return json.loads(cache_path.read_text(encoding="utf-8"))

    response = requests.get(url, timeout=60)
    response.raise_for_status()
    cache_path.write_bytes(response.content)
    return response.json()


def load_items(refresh: bool = False, cache_dir: pathlib.Path = CACHE_DIR) -> dict:
    """Returns the parsed items.json 'items' object, keyed by category
    (simpleitem, equipmentitem, weapon, consumableitem, mount, ...)."""
    return _cached_or_download(ITEMS_URL, "items.json", refresh, cache_dir)["items"]


def load_localized_names(refresh: bool = False, cache_dir: pathlib.Path = CACHE_DIR) -> list:
    """Returns the parsed formatted/items.json list of
    {UniqueName, LocalizedNames} entries."""
    return _cached_or_download(NAMES_URL, "names.json", refresh, cache_dir)


if __name__ == "__main__":
    refresh = "--refresh" in sys.argv
    items = load_items(refresh)
    names = load_localized_names(refresh)
    print(f"Cached {len(items)} item categories and {len(names)} localized names in {CACHE_DIR}")
