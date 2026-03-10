# FLE Documentation Foundation

Fisher Logic Engine (FLE) の仕様を定義するドキュメント正本（Single Source of Truth）です。
ドキュメント構造の複雑化を避けるため、実装と密接に結びつく最低限の仕様定義に留めています。

## 仕様カテゴリ

### 1. [system_spec/](system_spec/) - システム動作仕様
FLEアプリ自体のシステム的、技術的な実装仕様。
- [architecture.md](system_spec/architecture.md): Vite + Vanilla JSのアーキテクチャ構成
- [features.md](system_spec/features.md): アプリケーションの各モードとその機能
- [simulation_logic.md](system_spec/simulation_logic.md): シミュレータ内部の計算フロー（サイクル計算、重み・変数モード）
- [optimizer_alg.md](system_spec/optimizer_alg.md): 総合戦略評価（オプティマイザ）のアルゴリズム

### 2. [game_spec/](game_spec/) - ゲームドメイン仕様
FF14実機に基づいた釣りの基本ルールや、アプリ内でモデル化している計算概念。
※推測が含まれる部分やシステム上での独自解釈は明確に区別して記載します。
- [mechanics.md](game_spec/mechanics.md): キャストから釣り上げまでの基本サイクルと重みづけ
- [formulas.md](game_spec/formulas.md): ヒット率やステータスに基づく計算式（実装済みのもの）
- [skills.md](game_spec/skills.md): アプリでサポートしている各種スキル効果とシステム上の扱い

### 3. [data_spec/](data_spec/) - データ設計仕様
アプリが読み込むマスターデータの構造。
- [schema.md](data_spec/schema.md): `logic_master.json` 等のJSONデータ構造
- [semantics.md](data_spec/semantics.md): プロジェクト内で使用する用語定義
- [etl_process.md](data_spec/etl_process.md): 外部データ（CSV）からJSONの生成プロセス

---
旧バージョンのドキュメントは `../archive/v3.0_snapshot/` に保管しています。
