# FLE Documentation Foundation

Fisher Logic Engine (FLE) のドキュメント正本（Single Source of Truth）。

## ディレクトリ構成

### [game_spec/](game_spec/) - ゲーム仕様 (Game Domain)
FF14の釣り仕様、計算式、スキル効果など、実装に依存しない絶対的なルール。
- `mechanics.md`: ゲームメカニクス、スキル効果
- `formulas.md`: 獲得率、ヒット率などの基本計算式

### [data_spec/](data_spec/) - データ仕様 (Data Domain)
アプリが扱うデータの構造定義。
- `schema_definition.md`: `logic_master.json` 等のJSONスキーマ定義
- `etl_pipeline.md`: CSVからJSONへのデータ変換フロー

## 関連ドキュメント
- **[../docs/system_spec/](../docs/system_spec/)**: FLEアプリとしての実装仕様（アーキテクチャ、UI、ロジック）
- **[../archive/v3.0_snapshot/](../archive/v3.0_snapshot/)**: 旧ドキュメント (v3.0時点)
