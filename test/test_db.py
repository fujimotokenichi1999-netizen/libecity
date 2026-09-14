import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db import get_connection, init_db


class TestDb(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmpdir.name) / "test.db"

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_init_db_creates_meals_table(self):
        init_db(self.db_path)
        with get_connection(self.db_path) as conn:
            rows = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='meals'"
            ).fetchall()
        self.assertEqual(len(rows), 1)

    def test_insert_and_query_meal(self):
        init_db(self.db_path)
        with get_connection(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO meals (meal_date, recorded_at, dish_name, calories_kcal,
                    protein_g, fat_g, carbs_g, sodium_mg, image_path, notes)
                VALUES ('2026-01-01', '2026-01-01T12:00:00', '鮭弁当', 650, 30, 20, 70, 1500, '/tmp/x.jpg', '')
                """
            )
            conn.commit()
            row = conn.execute("SELECT * FROM meals").fetchone()
        self.assertEqual(row["dish_name"], "鮭弁当")
        self.assertEqual(row["calories_kcal"], 650)


if __name__ == "__main__":
    unittest.main()
