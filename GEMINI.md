# GEMINI.md: pj_FF14_Fisher-Logic-Engine

## 基本ルール
このプロジェクトは、ワークスペースルートの標準ルールに従います。
- **[ワークスペース標準ルール](../../GEMINI.md)**を必ず参照すること
- **[ワークスペース共通ツール](../../Tools/README.md)**を活用すること

---

## プロジェクト固有のディレクトリ構造

- **`foundation/`**: プロジェクト固有のルール・仕様
  - `core_formulas.md`: コア計算式(GP消費、釣果確率等)
  - `rules_and_mechanics.md`: プロジェクト固有のルール・メカニクス
  - `data_generation.md`: データ生成ルール
  - `README.md`: foundation概要
- **`docs/`**: ドキュメント
  - `reference/`: ゲーム仕様リファレンス
- **`src/`**: ソースコード
- **`scripts/`**: スクリプト
- **`plans_and_specs/`**: 計画・仕様
- **`archive/`**: アーカイブ

---

## 重要ドキュメント

作業開始時は以下を確認:

### プロジェクト固有
1. **[foundation/core_formulas.md](foundation/core_formulas.md)**: コア計算式
2. **[foundation/rules_and_mechanics.md](foundation/rules_and_mechanics.md)**: プロジェクト固有のルール
3. **[docs/reference/Game_Domain_Spec.md](docs/reference/Game_Domain_Spec.md)**: ゲーム仕様

### ワークスペース標準
4. **[ワークスペース標準ルール](../../GEMINI.md)**: 基本ルール、対話運用ルール
5. **[ワークスペース詳細ルール](../../Antigravity/foundation/rules_and_mechanics.md)**: Windowsターミナル実行、トラブルシューティング等
6. **[ワークスペース共通ツール](../../Tools/README.md)**: 利用可能なツール

---

更新日: 2026-02-05
