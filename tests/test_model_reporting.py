import io
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
from PIL import Image

from dashboard import server


class ModelReportingTests(unittest.TestCase):
    def test_segformer_checkpoint_path_is_configurable_without_changing_api(self):
        segmenter = Mock()
        factory = Mock(return_value=segmenter)
        module = SimpleNamespace(SegFormerSegmenter=factory)
        with (
            patch.object(server, "segformer_instance", None),
            patch.object(server, "SEGFORMER_CHECKPOINT", "/tmp/candidate.pt"),
            patch.object(server, "can_use_finetuned_segformer", return_value=True),
            patch.dict(os.environ, {"DISABLE_HEAVY_CV": "0"}, clear=True),
            patch.object(server.importlib, "import_module", return_value=module),
        ):
            loaded = server.get_segformer()

        self.assertIs(loaded, segmenter)
        factory.assert_called_once_with(
            model_name="nvidia/mit-b3",
            checkpoint_path="/tmp/candidate.pt",
        )

    def test_models_endpoint_reports_classical_runtime_without_unverified_metrics(self):
        with (
            patch.object(server, "heavy_cv_disabled", return_value=True),
            patch.object(server, "can_use_finetuned_segformer", return_value=False),
        ):
            response = server.app.test_client().get("/api/models")

        self.assertEqual(response.status_code, 200)
        models = {model["id"]: model for model in response.get_json()["models"]}
        self.assertEqual(models["segformer"]["name"], "Classical CV (SegFormer request fallback)")
        self.assertIsNone(models["segformer"]["mIoU"])
        self.assertIsNone(models["segformer"]["macro_f1"])
        self.assertIsNone(models["segformer"]["latency_ms"])
        self.assertTrue(models["classical"]["recommended"])

    def test_segmentation_response_identifies_classical_model_fallback(self):
        image_buffer = io.BytesIO()
        Image.new("RGB", (8, 8), color="blue").save(image_buffer, format="PNG")
        image_buffer.seek(0)
        class_mask = np.zeros((512, 512), dtype=np.uint8)
        segmenter = Mock()
        segmenter.model_id = "classical"
        segmenter.segment_image.return_value = (None, class_mask)

        with tempfile.TemporaryDirectory() as output_dir:
            with (
                patch.object(server, "get_segformer", return_value=segmenter),
                patch.object(server, "OVERLAY_CACHE_DIR", output_dir),
            ):
                response = server.app.test_client().post(
                    "/api/segment",
                    data={
                        "image": (image_buffer, "image.png"),
                        "model": "segformer",
                    },
                    content_type="multipart/form-data",
                )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["requested_model"], "segformer")
        self.assertEqual(payload["model_used"], "classical")
        self.assertTrue(payload["fallback_applied"])
        self.assertEqual(payload["model_display_name"], "Classical CV Multi-Space Thresholding")
        self.assertIsNone(payload["damage_metrics"]["damage_summary"]["total_flood_area_m2"])
        self.assertEqual(
            segmenter.segment_image.call_args.args[0].shape,
            (512, 512, 3),
        )


if __name__ == "__main__":
    unittest.main()
