# リベシティ

毎日の食事を記録するアプリです。料理の写真をアップロードすると、Claude(Anthropic)の画像認識でカロリー・タンパク質・脂質・炭水化物・塩分を自動推定し、日々の合計を確認できます。

## セットアップ

```bash
git clone <このリポジトリのURL>
pip install -r requirements.txt
export ANTHROPIC_API_KEY=<あなたのAPIキー>
```

## アプリの起動

```bash
uvicorn src.main:app --reload
```

起動後、ブラウザで http://localhost:8000 を開きます。

- 日付を選んで料理の写真をアップロードすると、AIが栄養価を推定して記録します
- その日の合計カロリー・タンパク質・脂質・炭水化物・塩分が表示されます
- 記録は削除できます

データはデフォルトで `data/meals.db`(SQLite)と `data/uploads/`(画像)に保存されます。保存先は環境変数 `MEAL_DB_PATH` / `MEAL_UPLOADS_DIR` で変更できます。使用するモデルは環境変数 `ANTHROPIC_MODEL` で変更できます(デフォルト: `claude-sonnet-5`)。

## テスト

```bash
python3 -m unittest discover -s test
```

テストはAI API呼び出しをモック化しているため、`ANTHROPIC_API_KEY` がなくても実行できます。
