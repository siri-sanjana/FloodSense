import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mcp_server.server import (
    BACKEND_URL,
    _image_request,
    _make_artifact_urls_absolute,
    _resolve_image_path,
)


class McpServerTests(unittest.TestCase):
    def test_image_request_requires_exactly_one_input(self):
        with self.assertRaisesRegex(ValueError, "exactly one"):
            _image_request(None, None)
        with self.assertRaisesRegex(ValueError, "exactly one"):
            _image_request("sample-1", "/tmp/image.png")

    def test_image_paths_are_restricted_to_configured_directories(self):
        with tempfile.TemporaryDirectory() as allowed_dir, tempfile.TemporaryDirectory() as blocked_dir:
            allowed_image = Path(allowed_dir) / "image.png"
            allowed_image.write_bytes(b"image")
            blocked_image = Path(blocked_dir) / "image.png"
            blocked_image.write_bytes(b"image")

            with patch.dict(os.environ, {"FLOODSENSE_ALLOWED_IMAGE_DIRS": allowed_dir}):
                self.assertEqual(_resolve_image_path(str(allowed_image)), allowed_image.resolve())
                with self.assertRaisesRegex(ValueError, "outside the allowed directories"):
                    _resolve_image_path(str(blocked_image))

    def test_artifact_urls_are_made_absolute_without_changing_other_text(self):
        result = _make_artifact_urls_absolute({
            "overlay_url": "/api/overlay/result.png",
            "report": "A path-like /report/value should remain text.",
        })

        self.assertEqual(result["overlay_url"], f"{BACKEND_URL}/api/overlay/result.png")
        self.assertEqual(result["report"], "A path-like /report/value should remain text.")


if __name__ == "__main__":
    unittest.main()
