import tempfile
import unittest
from importlib import import_module
from pathlib import Path

resolve_dataset_sources = import_module(
    "models_benchmark.06_segformer_finetune"
).resolve_dataset_sources
load_official_train_ids = import_module(
    "models_benchmark.06_segformer_finetune"
).load_official_train_ids
matching_training_images = import_module(
    "models_benchmark.download_floodnet_train_images"
)._matching_training_images


class DatasetSplitSourceTests(unittest.TestCase):
    def test_default_sources_keep_official_validation_out_of_training(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            train_sources, validation_sources, strategy = resolve_dataset_sources(
                temporary_directory
            )

        self.assertEqual(strategy, "official_train_official_validation")
        self.assertEqual(len(train_sources), 1)
        self.assertEqual(len(validation_sources), 1)
        self.assertTrue(str(train_sources[0][0]).endswith("train/train-org-img"))
        self.assertTrue(str(validation_sources[0][0]).endswith("val/val-org-img"))
        self.assertNotEqual(train_sources[0][0], validation_sources[0][0])
        self.assertNotIn("test", train_sources[0][0].parts)
        self.assertNotIn("test", validation_sources[0][0].parts)

    def test_custom_directories_use_seeded_random_split(self):
        train_sources, validation_sources, strategy = resolve_dataset_sources(
            "unused-root",
            "custom-images",
            "custom-masks",
        )

        self.assertEqual(strategy, "seeded_random_custom_split")
        self.assertIsNone(validation_sources)
        self.assertEqual(train_sources, [(Path("custom-images"), Path("custom-masks"))])

    def test_custom_image_and_mask_directories_must_be_paired(self):
        with self.assertRaisesRegex(ValueError, "provided together"):
            resolve_dataset_sources("unused-root", img_dir="custom-images")

    def test_official_train_manifest_is_required_and_validated(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            with self.assertRaisesRegex(FileNotFoundError, "Run"):
                load_official_train_ids(temporary_directory)

            manifest = (
                Path(temporary_directory)
                / "FloodNet-Supervised_v1.0"
                / "train"
                / "train-labeled-ids.txt"
            )
            manifest.parent.mkdir(parents=True)
            manifest.write_text("sample\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "Expected 398"):
                load_official_train_ids(temporary_directory)

    def test_downloader_selects_only_missing_images_with_masks(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            images = root / "images"
            masks = root / "masks"
            images.mkdir()
            masks.mkdir()
            (masks / "with-mask_lab.png").touch()
            (masks / "already-present_lab.png").touch()
            (images / "already-present.jpg").touch()

            official_ids = {"with-mask", "already-present"}
            entries = [
                {
                    "path": "train_image/img/with-mask.JPG",
                    "size": 10,
                },
                {
                    "path": "train_image/img/already-present.JPG",
                    "size": 10,
                },
                {
                    "path": "train_image/img/no-mask.JPG",
                    "size": 10,
                },
            ]

            selected = matching_training_images(
                entries,
                images,
                masks,
                official_ids=official_ids,
            )

        self.assertEqual(
            [entry["path"] for entry in selected],
            [
                "train_image/img/already-present.JPG",
                "train_image/img/with-mask.JPG",
            ],
        )

if __name__ == "__main__":
    unittest.main()
