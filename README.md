# リベシティ

毎日の食事を記録するアプリです。料理の写真をアップロードすると、Claude(Anthropic)の画像認識でカロリー・タンパク質・脂質・炭水化物・塩分を自動推定し、日々の合計を確認できます。

サーバー不要の静的PWA(Progressive Web App)として `webapp/` に実装しています。詳しい使い方は [webapp/README.md](webapp/README.md) を参照してください。

## テスト

```bash
python3 -m unittest discover -s test
```
