import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "meals.db"


def get_db_path() -> Path:
    return Path(os.environ.get("MEAL_DB_PATH", str(DEFAULT_DB_PATH)))


@contextmanager
def get_connection(db_path: Path = None):
    path = Path(db_path) if db_path else get_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def init_db(db_path: Path = None) -> None:
    with get_connection(db_path) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS meals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                meal_date TEXT NOT NULL,
                recorded_at TEXT NOT NULL,
                dish_name TEXT,
                calories_kcal REAL,
                protein_g REAL,
                fat_g REAL,
                carbs_g REAL,
                sodium_mg REAL,
                image_path TEXT,
                notes TEXT
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_meals_meal_date ON meals (meal_date)"
        )
        conn.commit()
