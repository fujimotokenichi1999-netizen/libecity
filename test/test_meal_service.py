import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import meal_service
from src.db import init_db


class TestMealService(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "test.db"
        self.uploads_dir = Path(self.tmpdir.name) / "uploads"
        init_db(self.db_path)

        self.analyzer = MagicMock()
        self.analyzer.analyze.return_value = {
            "dish_name": "鮭弁当",
            "calories_kcal": 650,
            "protein_g": 30,
            "fat_g": 20,
            "carbs_g": 70,
            "sodium_mg": 1500,
            "notes": "",
        }

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_create_meal_stores_record_and_image(self):
        meal = meal_service.create_meal(
            image_bytes=b"fake-image-bytes",
            media_type="image/jpeg",
            meal_date="2026-01-01",
            db_path=self.db_path,
            uploads_dir=self.uploads_dir,
            analyzer=self.analyzer,
        )
        self.assertEqual(meal["dish_name"], "鮭弁当")
        self.assertEqual(meal["meal_date"], "2026-01-01")
        self.assertTrue(Path(meal["image_path"]).exists())

    def test_list_meals_filters_by_date(self):
        meal_service.create_meal(
            image_bytes=b"a", media_type="image/jpeg", meal_date="2026-01-01",
            db_path=self.db_path, uploads_dir=self.uploads_dir, analyzer=self.analyzer,
        )
        meal_service.create_meal(
            image_bytes=b"b", media_type="image/jpeg", meal_date="2026-01-02",
            db_path=self.db_path, uploads_dir=self.uploads_dir, analyzer=self.analyzer,
        )
        meals = meal_service.list_meals("2026-01-01", db_path=self.db_path)
        self.assertEqual(len(meals), 1)

    def test_daily_summary_sums_nutrients(self):
        for _ in range(2):
            meal_service.create_meal(
                image_bytes=b"a", media_type="image/jpeg", meal_date="2026-01-01",
                db_path=self.db_path, uploads_dir=self.uploads_dir, analyzer=self.analyzer,
            )
        summary = meal_service.get_daily_summary("2026-01-01", db_path=self.db_path)
        self.assertEqual(summary["meal_count"], 2)
        self.assertEqual(summary["calories_kcal"], 1300)
        self.assertEqual(summary["sodium_mg"], 3000)

    def test_delete_meal_removes_record_and_image(self):
        meal = meal_service.create_meal(
            image_bytes=b"a", media_type="image/jpeg", meal_date="2026-01-01",
            db_path=self.db_path, uploads_dir=self.uploads_dir, analyzer=self.analyzer,
        )
        image_path = Path(meal["image_path"])
        deleted = meal_service.delete_meal(meal["id"], db_path=self.db_path)
        self.assertTrue(deleted)
        self.assertFalse(image_path.exists())
        self.assertIsNone(meal_service.get_meal(meal["id"], db_path=self.db_path))

    def test_delete_missing_meal_returns_false(self):
        deleted = meal_service.delete_meal(9999, db_path=self.db_path)
        self.assertFalse(deleted)


if __name__ == "__main__":
    unittest.main()
