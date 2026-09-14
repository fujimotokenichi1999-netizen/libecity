import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.nutrition_analyzer import NutritionAnalysisError, parse_nutrition_json


class TestParseNutritionJson(unittest.TestCase):
    def test_parses_plain_json(self):
        text = '{"dish_name": "唐揚げ弁当", "calories_kcal": 750, "protein_g": 35, "fat_g": 30, "carbs_g": 80, "sodium_mg": 1800}'
        data = parse_nutrition_json(text)
        self.assertEqual(data["dish_name"], "唐揚げ弁当")
        self.assertEqual(data["calories_kcal"], 750)

    def test_strips_markdown_code_fence(self):
        text = '```json\n{"dish_name": "サラダ", "calories_kcal": 200, "protein_g": 5, "fat_g": 10, "carbs_g": 20, "sodium_mg": 300}\n```'
        data = parse_nutrition_json(text)
        self.assertEqual(data["dish_name"], "サラダ")

    def test_extracts_json_surrounded_by_text(self):
        text = 'はい、分析結果です。\n{"dish_name": "パスタ", "calories_kcal": 600, "protein_g": 18, "fat_g": 15, "carbs_g": 90, "sodium_mg": 1200}\nよろしくお願いします。'
        data = parse_nutrition_json(text)
        self.assertEqual(data["dish_name"], "パスタ")

    def test_raises_on_invalid_json(self):
        with self.assertRaises(NutritionAnalysisError):
            parse_nutrition_json("これはJSONではありません")

    def test_raises_on_missing_fields(self):
        with self.assertRaises(NutritionAnalysisError):
            parse_nutrition_json('{"dish_name": "不明"}')


if __name__ == "__main__":
    unittest.main()
