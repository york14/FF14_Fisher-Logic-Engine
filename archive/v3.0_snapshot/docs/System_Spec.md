---
STATUS: INDEX
VERSION: 3.2.0
LAST_UPDATED: 2026/02/05
TARGET_LOGIC: FLE v3.0 (Modular Architecture)
---

# Fisher Logic Engine (FLE) システム仕様書

## 🚀 初めての方へ

このプロジェクトを初めて扱う場合、以下の順序で読むことを推奨します:

1. **[GEMINI.md](../GEMINI.md)** - プロジェクト固有のルール(必読)
2. **[核心計算式](../foundation/core_formulas.md)** - 計算ロジックの基礎(必読)
3. **[不変ルール](../foundation/rules_and_mechanics.md)** - ゲームメカニクス(必読)
4. **[データ生成フロー](../foundation/data_generation.md)** - CSV→JSON変換(必読)
5. 本ドキュメント - システム全体の構成

---

**Version**: 3.2.0  
**Last Updated**: 2026/02/05  
**Target Logic**: FLE v3.0 (Modular Architecture)

---

## 📚 ドキュメント構造

### ゲーム仕様(不変のルール)
- **[foundation/core_formulas.md](../foundation/core_formulas.md)** - 計算式と定数
- **[foundation/rules_and_mechanics.md](../foundation/rules_and_mechanics.md)** - 不変ルール
- **[foundation/data_generation.md](../foundation/data_generation.md)** - データ生成ルール

### アーカイブ(参照のみ)
- **archive/2026-02-05_archived_docs/reference/** - 旧ゲーム仕様リファレンス
- **archive/2026-02-05_archived_docs/specs/** - 旧詳細仕様書
- **archive/2026-02-05_archived_docs/foundation_README.md** - 旧AI引き継ぎガイド

---

## 🛠️ グローバルアーキテクチャ概要

### モジュラー設計 (v3.0)
アプリケーションロジックは、純粋な計算モジュールとUIハンドリングに分離されている。

*   `src/core/`:
    *   `calculator.js`: 純粋関数、ステートレス。Config + MasterDB から統計情報を計算。
    *   `optimizer.js`: GP関連の計算。
    *   `scenario.js`: ID文字列操作。
*   `src/ui/`:
    *   `controls.js`: DOMイベントハンドリング、入力バインディング。
    *   `render.js`: HTML生成、結果表示。
*   `src/data/`:
    *   `logic_master.json`: 静的データベース。

### 処理フロー
`[UI入力]` -> `[main.js]` -> `[calculator.js] (optimizer/scenarioを使用)` -> `[Stats返却]` -> `[render.js]` -> `[DOM更新]`

---

## 📝 更新履歴

- **2026/02/05**: ドキュメント構造整理。旧ドキュメントをarchive/2026-02-05_archived_docs/に移動。
- **2026/02/03**: v3.1.0リリース
