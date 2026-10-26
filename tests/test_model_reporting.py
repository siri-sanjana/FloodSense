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
    def test_grass_is_reclassified_as_water_without_mutating_model_mask(self):
        class_mask = np.array([[5, 9]], dtype=np.uint8)
        remapped_mask = server.reclassify_grass_as_water(class_mask)

        overlay = server.generate_color_overlay(
            np.zeros((1, 2, 3), dtype=np.uint8),
            remapped_mask,
        )

        self.assertEqual(tuple(overlay[0, 0]), (2, 132, 199))
        self.assertEqual(tuple(overlay[0, 1]), (2, 132, 199))
        self.assertEqual(remapped_mask.tolist(), [[5, 5]])
        self.assertEqual(class_mask.tolist(), [[5, 9]])

    def test_segment_endpoint_reclassifies_grass_in_masks_metrics_and_overlay(self):
        class_mask = np.full((512, 512), 9, dtype=np.uint8)
        class_mask[:, :256] = 5
        segmenter = Mock()
        segmenter.model_id = "segformer"
        segmenter.segment_image.return_value = (None, class_mask)
        saved_artifacts = {}

        def save_artifact(prefix, image):
            saved_artifacts[prefix] = np.array(image, copy=True)
            return f"/api/overlay/{prefix}.png"

        with (
            patch.object(server, "_load_inference_image", return_value=Image.new("RGB", (8, 8))),
            patch.object(server, "get_segformer", return_value=segmenter),
            patch.object(server, "can_use_finetuned_segformer", return_value=True),
            patch.object(server, "_save_inference_png", side_effect=save_artifact),
        ):
            response = server.app.test_client().post("/api/segment", data={"model": "segformer"})

        result = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(result["damage_metrics"]["class_pixel_counts"]["water"], 512 * 512)
        self.assertEqual(result["damage_metrics"]["class_pixel_counts"]["grass"], 0)
        self.assertEqual(result["damage_metrics"]["damage_summary"]["total_flood_area_px"], 512 * 512)
        self.assertEqual(result["class_reclassification"], server.GRASS_AS_WATER_NOTE)
        self.assertTrue(np.all(saved_artifacts["classes"] == 5))
        self.assertTrue(np.all(saved_artifacts["flood"] == 255))
        self.assertTrue(np.all(saved_artifacts["overlay"] == (2, 132, 199)))
        self.assertTrue(np.all(class_mask[:, 256:] == 9))

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

    def test_analysis_reclassifies_grass_before_metrics_and_reporting(self):
        image_buffer = io.BytesIO()
        Image.new("RGB", (8, 8), color="blue").save(image_buffer, format="PNG")
        image_buffer.seek(0)
        segmenter = Mock()
        segmenter.model_id = "segformer"
        predicted_mask = np.zeros((512, 512), dtype=np.uint8)
        predicted_mask[:256] = 9
        segmenter.segment_image.return_value = (None, predicted_mask)
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
        analysis_metrics = report_engine.generate_grounded_report.call_args.args[0]
        self.assertEqual(analysis_metrics["class_pixel_counts"]["water"], 256 * 512)
        self.assertEqual(analysis_metrics["class_pixel_counts"]["grass"], 0)
        self.assertEqual(
            analysis_metrics["class_reclassification"],
            server.GRASS_AS_WATER_NOTE,
        )
        self.assertEqual(
            response.get_json()["class_reclassification"],
            server.GRASS_AS_WATER_NOTE,
        )
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
            patch.object(server, "ENABLE_FINETUNED_SEGFORMER", False),
            patch.object(server, "SEGFORMER_CHECKPOINT", "/tmp/candidate.pt"),
            patch.object(server, "can_use_finetuned_segformer", return_value=True),
            patch.object(
                server,
                "resolve_segformer_checkpoint",
                return_value="/tmp/candidate.pt",
            ),
            patch.dict(os.environ, {"DISABLE_HEAVY_CV": "0"}, clear=True),
            patch.object(server.importlib, "import_module", return_value=module),
        ):
            loaded = server.get_segformer()

        self.assertIs(loaded, segmenter)
        factory.assert_called_once_with(
            model_name="nvidia/mit-b3",
            checkpoint_path="/tmp/candidate.pt",
        )

    def test_explicit_finetuned_segformer_overrides_cloud_cv_disable(self):
        segmenter = Mock()
        factory = Mock(return_value=segmenter)
        module = SimpleNamespace(SegFormerSegmenter=factory)
        with (
            patch.object(server, "segformer_instance", None),
            patch.object(server, "ENABLE_FINETUNED_SEGFORMER", True),
            patch.object(server, "SEGFORMER_CHECKPOINT", "/var/data/class-balanced.pt"),
            patch.object(server, "has_finetuned_segformer", return_value=True),
            patch.object(server, "can_use_finetuned_segformer", return_value=True),
            patch.object(
                server,
                "resolve_segformer_checkpoint",
                return_value="/var/data/class-balanced.pt",
            ),
            patch.dict(os.environ, {"RENDER": "true", "DISABLE_HEAVY_CV": "1"}, clear=True),
            patch.object(server.importlib, "import_module", return_value=module),
        ):
            loaded = server.get_segformer()

        self.assertIs(loaded, segmenter)
        factory.assert_called_once_with(
            model_name="nvidia/mit-b3",
            checkpoint_path="/var/data/class-balanced.pt",
        )

    def test_explicit_finetuned_segformer_fails_if_checkpoint_is_missing(self):
        with (
            patch.object(server, "segformer_instance", None),
            patch.object(server, "ENABLE_FINETUNED_SEGFORMER", True),
            patch.object(server, "SEGFORMER_CHECKPOINT", "/var/data/missing.pt"),
            patch.object(server, "has_finetuned_segformer", return_value=False),
            patch.dict(os.environ, {"RENDER": "true", "DISABLE_HEAVY_CV": "1"}, clear=True),
        ):
            with self.assertRaisesRegex(FileNotFoundError, "configured checkpoint"):
                server.get_segformer()

    def test_models_endpoint_reports_enabled_segformer_even_when_other_cv_is_disabled(self):
        with (
            patch.object(server, "heavy_cv_disabled", return_value=True),
            patch.object(server, "can_use_finetuned_segformer", return_value=True),
            patch.object(
                server,
                "FINETUNED_SEGFORMER_DISPLAY_NAME",
                "Class-balanced SegFormer-B3",
            ),
        ):
            response = server.app.test_client().get("/api/models")

        models = {model["id"]: model for model in response.get_json()["models"]}
        self.assertEqual(models["segformer"]["name"], "Class-balanced SegFormer-B3")
        self.assertTrue(models["segformer"]["recommended"])
        self.assertFalse(models["classical"]["recommended"])
        self.assertEqual(models["sam"]["name"], "Classical CV (SAM request fallback)")

    def test_private_huggingface_checkpoint_resolution_uses_platform_secret(self):
        from huggingface_hub import hf_hub_download

        with (
            patch.object(server, "SEGFORMER_REPO_ID", "floodsense/class-balanced"),
            patch.object(server, "SEGFORMER_REPO_FILENAME", "segformer_best.pt"),
            patch.object(server, "SEGFORMER_REPO_REVISION", "main"),
            patch.dict(os.environ, {"HF_TOKEN": "test-secret"}, clear=True),
            patch(
                "huggingface_hub.hf_hub_download",
                return_value="/cache/segformer_best.pt",
            ) as download,
        ):
            checkpoint = server.resolve_segformer_checkpoint()

        self.assertEqual(checkpoint, "/cache/segformer_best.pt")
        download.assert_called_once_with(
            repo_id="floodsense/class-balanced",
            filename="segformer_best.pt",
            revision="main",
            token="test-secret",
            cache_dir=None,
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
