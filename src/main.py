from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src import meal_service
from src.db import init_db
from src.nutrition_analyzer import NutritionAnalysisError

STATIC_DIR = Path(__file__).resolve().parent / "static"
ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}

app = FastAPI(title="毎日の食事記録アプリ")


@app.on_event("startup")
def on_startup():
    init_db()


def _validate_date(value: str) -> str:
    try:
        datetime.strptime(value, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="日付は YYYY-MM-DD 形式で指定してください")
    return value


@app.post("/api/meals")
async def upload_meal(
    image: UploadFile = File(...),
    meal_date: str = Query(default=None),
):
    if meal_date:
        _validate_date(meal_date)

    if image.content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"対応していない画像形式です: {image.content_type}",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="画像データが空です")

    try:
        meal = meal_service.create_meal(
            image_bytes=image_bytes,
            media_type=image.content_type,
            meal_date=meal_date,
        )
    except NutritionAnalysisError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return meal


@app.get("/api/meals")
def get_meals(meal_date: str = Query(...)):
    _validate_date(meal_date)
    return meal_service.list_meals(meal_date)


@app.get("/api/summary")
def get_summary(meal_date: str = Query(...)):
    _validate_date(meal_date)
    return meal_service.get_daily_summary(meal_date)


@app.delete("/api/meals/{meal_id}")
def remove_meal(meal_id: int):
    deleted = meal_service.delete_meal(meal_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="指定された記録が見つかりません")
    return {"status": "deleted", "id": meal_id}


@app.get("/api/meals/{meal_id}/image")
def get_meal_image(meal_id: int):
    meal = meal_service.get_meal(meal_id)
    if meal is None or not meal.get("image_path"):
        raise HTTPException(status_code=404, detail="画像が見つかりません")
    image_path = Path(meal["image_path"])
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="画像ファイルが見つかりません")
    return FileResponse(image_path)


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
