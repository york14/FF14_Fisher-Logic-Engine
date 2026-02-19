# FLE 仕様書書き直しに向けたメモ (v4.0 Spec Planning)

## 現状の課題
- **仕様書とコードの乖離**: v3.0以降の変更（モジュラー化、Optimizer実装、変数モード）がSystem_Spec.mdやcore_formulas.mdに未反映。
- **未文書化のモジュール**:
    - `src/ui/tab_optimizer.js`: 総合戦略評価のUI制御・計算フロー
    - `src/core/optimizer_module.js`: 混合戦略（Burn/Eco）シミュレーション
    - `share.html` / `initShareMode`: シェア機能
- **情報の分散**: docs/, foundation/, plans_and_specs/ に散在。

## 書き直し方針（案）

### 1. ドキュメント体系の整理
- **`foundation/`**: 変更なし（core_formulas.md, rules_and_mechanics.md）
- **`docs/architecture/`**: システム構造（新規）
    - `system_overview.md`: 全体像、モジュール構成図
    - `optimizer_spec.md`: 総合戦略評価ロジック
    - `data_flow.md`: config/MasterDB構造
    - `ui_spec.md`: タブ構成、シェア機能

### 2. 作業ステップ
1. **現状調査**: ソースコードからJSDoc/コメント抽出
2. **構成案作成**: ファイル構成と目次案を提示
3. **執筆**: 各モジュール仕様記述

## 今後の検討事項
- optimizer.jsとoptimizer_module.jsのリファクタリング要否
- テストコードの扱い
