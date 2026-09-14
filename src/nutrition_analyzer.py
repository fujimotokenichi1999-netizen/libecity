import json
import os
import re

DEFAULT_MODEL = "claude-sonnet-5"

PROMPT = """\
これは食事の写真です。写っている料理を分析し、1食分の栄養価を推定してください。
必ず次のキーだけを持つJSONオブジェクトのみを出力してください。説明文やマークダウンは不要です。

{
  "dish_name": "料理名(日本語、不明な場合は「不明」)",
  "calories_kcal": 推定カロリー(数値、kcal),
  "protein_g": 推定タンパク質量(数値、g),
  "fat_g": 推定脂質量(数値、g),
  "carbs_g": 推定炭水化物量(数値、g),
  "sodium_mg": 推定塩分(ナトリウム)量(数値、mg),
  "notes": "推定の前提や補足(任意、簡潔に)"
}

数値は全て概算でよいので、必ず数値(null不可)を入れてください。
"""


class NutritionAnalysisError(RuntimeError):
    pass


def parse_nutrition_json(text: str) -> dict:
    """Claudeのレスポンステキストから栄養情報のJSONを抽出してパースする。"""
    stripped = text.strip()
    stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
    stripped = re.sub(r"\s*```$", "", stripped)

    match = re.search(r"\{.*\}", stripped, re.DOTALL)
    candidate = match.group(0) if match else stripped

    try:
        data = json.loads(candidate)
    except json.JSONDecodeError as exc:
        raise NutritionAnalysisError(
            f"AIの応答をJSONとして解析できませんでした: {exc}"
        ) from exc

    required_fields = [
        "dish_name",
        "calories_kcal",
        "protein_g",
        "fat_g",
        "carbs_g",
        "sodium_mg",
    ]
    missing = [field for field in required_fields if field not in data]
    if missing:
        raise NutritionAnalysisError(f"AIの応答に必要な項目がありません: {missing}")

    return data


class NutritionAnalyzer:
    def __init__(self, api_key: str = None, model: str = None):
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
        self.model = model or os.environ.get("ANTHROPIC_MODEL", DEFAULT_MODEL)

    def analyze(self, image_bytes: bytes, media_type: str) -> dict:
        if not self.api_key:
            raise NutritionAnalysisError(
                "ANTHROPIC_API_KEY が設定されていません。環境変数を設定してください。"
            )

        import base64

        import anthropic

        client = anthropic.Anthropic(api_key=self.api_key)
        image_b64 = base64.standard_b64encode(image_bytes).decode("utf-8")

        response = client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {"type": "text", "text": PROMPT},
                    ],
                }
            ],
        )

        text_parts = [block.text for block in response.content if block.type == "text"]
        full_text = "\n".join(text_parts)
        return parse_nutrition_json(full_text)
