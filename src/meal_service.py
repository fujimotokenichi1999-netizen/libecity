import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from src.db import get_connection
from src.nutrition_analyzer import NutritionAnalyzer

DEFAULT_UPLOADS_DIR = Path(__file__).resolve().parent.parent / "data" / "uploads"


def get_uploads_dir() -> Path:
    return Path(os.environ.get("MEAL_UPLOADS_DIR", str(DEFAULT_UPLOADS_DIR)))


def _save_image(image_bytes: bytes, media_type: str, uploads_dir: Path = None) -> str:
    uploads_dir = uploads_dir or get_uploads_dir()
    uploads_dir.mkdir(parents=True, exist_ok=True)
    ext = media_type.split("/")[-1] if "/" in media_type else "jpg"
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = uploads_dir / filename
    path.write_bytes(image_bytes)
    return str(path)


def create_meal(
    image_bytes: bytes,
    media_type: str,
    meal_date: str = None,
    db_path: Path = None,
    uploads_dir: Path = None,
    analyzer: NutritionAnalyzer = None,
) -> dict:
    now = datetime.now(timezone.utc).astimezone()
    meal_date = meal_date or now.strftime("%Y-%m-%d")

    analyzer = analyzer or NutritionAnalyzer()
    nutrition = analyzer.analyze(image_bytes, media_type)

    image_path = _save_image(image_bytes, media_type, uploads_dir)

    with get_connection(db_path) as conn:
        cursor = conn.execute(
            """
            INSERT INTO meals (
                meal_date, recorded_at, dish_name,
                calories_kcal, protein_g, fat_g, carbs_g, sodium_mg,
                image_path, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                meal_date,
                now.isoformat(),
                nutrition.get("dish_name"),
                nutrition.get("calories_kcal"),
                nutrition.get("protein_g"),
                nutrition.get("fat_g"),
                nutrition.get("carbs_g"),
                nutrition.get("sodium_mg"),
                image_path,
                nutrition.get("notes"),
            ),
        )
        conn.commit()
        meal_id = cursor.lastrowid

    return get_meal(meal_id, db_path=db_path)


def get_meal(meal_id: int, db_path: Path = None) -> dict:
    with get_connection(db_path) as conn:
        row = conn.execute("SELECT * FROM meals WHERE id = ?", (meal_id,)).fetchone()
    return dict(row) if row else None


def list_meals(meal_date: str, db_path: Path = None) -> list:
    with get_connection(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM meals WHERE meal_date = ? ORDER BY recorded_at ASC",
            (meal_date,),
        ).fetchall()
    return [dict(row) for row in rows]


def delete_meal(meal_id: int, db_path: Path = None) -> bool:
    meal = get_meal(meal_id, db_path=db_path)
    if meal is None:
        return False

    with get_connection(db_path) as conn:
        conn.execute("DELETE FROM meals WHERE id = ?", (meal_id,))
        conn.commit()

    if meal.get("image_path"):
        image_path = Path(meal["image_path"])
        if image_path.exists():
            image_path.unlink()

    return True


def get_daily_summary(meal_date: str, db_path: Path = None) -> dict:
    meals = list_meals(meal_date, db_path=db_path)

    def total(field):
        return round(sum(meal.get(field) or 0 for meal in meals), 1)

    return {
        "meal_date": meal_date,
        "meal_count": len(meals),
        "calories_kcal": total("calories_kcal"),
        "protein_g": total("protein_g"),
        "fat_g": total("fat_g"),
        "carbs_g": total("carbs_g"),
        "sodium_mg": total("sodium_mg"),
    }
