import json
from unittest.mock import patch, MagicMock

from download import load_items, load_localized_names


def _make_response(payload):
    payload_bytes = json.dumps(payload).encode("utf-8")
    mock = MagicMock()
    mock.content = payload_bytes
    mock.json.return_value = payload
    mock.raise_for_status.return_value = None
    return mock


def test_load_items_downloads_and_caches(tmp_path):
    with patch("download.requests.get", return_value=_make_response({"items": {"simpleitem": []}})) as mock_get:
        result = load_items(refresh=True, cache_dir=tmp_path)
        assert result == {"simpleitem": []}
        assert mock_get.call_count == 1

        # second call without refresh reads from cache, no second network call
        result2 = load_items(refresh=False, cache_dir=tmp_path)
        assert result2 == {"simpleitem": []}
        assert mock_get.call_count == 1


def test_load_localized_names_returns_list(tmp_path):
    payload = [{"UniqueName": "T4_CLOTH", "LocalizedNames": {"EN-US": "Fine Cloth"}}]
    with patch("download.requests.get", return_value=_make_response(payload)):
        result = load_localized_names(refresh=True, cache_dir=tmp_path)
        assert result[0]["UniqueName"] == "T4_CLOTH"
