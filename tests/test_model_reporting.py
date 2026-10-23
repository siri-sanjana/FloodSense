import io
import os
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np
from PIL import Image

from dashboard import server
from report_generation.llm_engine import FloodLLMEngine


class ModelReportingTests(unittest.TestCase):
    def test_flood_class_pixel_counts_and_coverage_match_predicted_mask(self):
        class_ids = {label: class_id for class_id, (label, _) in server.COLOR_PALETTE.items()}
        pixels = [
            class_ids["building-flooded"],
            class_ids["building-flooded"],
            class_ids["road-flooded"],
            class_ids["road-flooded"],
            class_ids["road-flooded"],
            class_ids["water"],
            class_ids["water"],
            class_ids["water"],
            class_ids["water"],
            class_ids["water"],
            class_ids["pool"],
            class_ids["pool"],
            class_ids["pool"],
            class_ids["pool"],
            class_ids["pool"],
            class_ids["pool"],
            class_ids["pool"],
            class_ids["grass"],
            class_ids["grass"],
            class_ids["grass"],
        ]
        metrics = server.extract_metrics_from_class_mask(
            np.array(pixels, dtype=np.uint8).reshape(4, 5)
        )

        self.assertEqual(metrics["damage_summary"]["total_flood_area_px"], 17)
        self.assertEqual(metrics["damage_summary"]["flood_coverage_pct"], 85.0)
        self.assertEqual(metrics["class_pixel_counts"]["building-flooded"], 2)
        self.assertEqual(metrics["class_pixel_counts"]["road-flooded"], 3)
        self.assertEqual(metrics["class_pixel_counts"]["water"], 5)
        self.assertEqual(metrics["class_pixel_counts"]["pool"], 7)
        self.assertEqual(metrics["class_pixel_counts"]["grass"], 3)

    def test_analysis_rejects_follow_up_questions_over_limit(self):
        response = server.app.test_client().post(
            "/api/analyze",
            data={"question": "q" * 2001},
            content_type="multipart/form-data",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("question must contain", response.get_json()["error"])

    def test_analysis_passes_follow_up_question_to_report_generator(self):
        image_buffer = io.BytesIO()
        Image.new("RGB", (8, 8), color="blue").save(image_buffer, format="PNG")
        image_buffer.seek(0)
        segmenter = Mock()
        segmenter.model_id = "segformer"
        segmenter.segment_image.return_value = (None, np.zeros((512, 512), dtype=np.uint8))
        depth_estimator = Mock()
        depth_estimator.estimate.return_value = np.zeros((8, 8, 3), dtype=np.uint8)
        retriever = Mock()
        retriever.retrieve_grounded_protocols.return_value = []
        retriever.retrieve_query.return_value = []
        report_engine = Mock()
        report_engine.generate_grounded_report.return_value = {
            "incident_report": {},
            "markdown_rendered": "Image report",
            "follow_up_answer": "No flooded pixels were predicted.",
        }

        with tempfile.TemporaryDirectory() as output_dir:
            with (
                patch.object(server, "select_best_model_for_image", return_value=("segformer", "test")),
                patch.object(server, "get_segformer", return_value=segmenter),
                patch.object(server, "get_relative_depth_estimator", return_value=depth_estimator),
                patch.object(server, "get_rag_components", return_value=(None, retriever, report_engine)),
                patch.object(server, "OVERLAY_CACHE_DIR", output_dir),
            ):
                response = server.app.test_client().post(
                    "/api/analyze",
                    data={
                        "image": (image_buffer, "image.png"),
                        "model": "segformer",
                        "question": "How many flood pixels are predicted?",
                    },
                    content_type="multipart/form-data",
                )

        self.assertEqual(response.status_code, 200)
        report_engine.generate_grounded_report.assert_called_once()
        self.assertEqual(
            report_engine.generate_grounded_report.call_args.kwargs["user_question"],
            "How many flood pixels are predicted?",
        )
        retriever.retrieve_query.assert_called_once_with(
            "How many flood pixels are predicted?",
            top_k=4,
        )
        self.assertEqual(response.get_json()["follow_up_answer"], "No flooded pixels were predicted.")

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

    def test_offline_follow_up_answers_from_same_image_metrics(self):
        metrics = server.extract_metrics_from_class_mask(
            np.array([[1, 3, 5, 8, 0]], dtype=np.uint8)
        )
        report = FloodLLMEngine(provider="offline").generate_grounded_report(
            metrics,
            [],
            user_question="How many flood-class pixels are predicted?",
        )

        self.assertIn("4 flood-class pixels", report["follow_up_answer"])
        self.assertIn("## Follow-up question", report["markdown_rendered"])


if __name__ == "__main__":
    unittest.main()
