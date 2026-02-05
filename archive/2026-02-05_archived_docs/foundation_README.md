# FF14 Fisher Logic Engine - AI引き継ぎガイド

**Version**: 3.1.0  
**Last Updated**: 2026-02-04  
**Purpose**: 新しいAIセッション開始時の必読ドキュメント

---

## 🚀 クイックスタート（5分で理解）

このプロジェクトは、**FF14の釣りシステムにおける最適戦略を計算するシミュレーター**です。

### 必読ドキュメント（この順序で読む）

1. **[核心計算式](core_formulas.md)** ← **最優先で読むこと**
   - ヒット率計算式 ($P_i$, $P_{Scenario}$)
   - 時間計算の積分モデル
   - GDS定数表

2. **[ゲームメカニクスの不変ルール](rules_and_mechanics.md)**
   - 出現判定の基本原則
   - スキル効果のリセットタイミング
   - 1サイクルのタイムライン

3. **[システム仕様書](../docs/System_Spec.md)**
   - システム全体の構成
   - モジュール構造

---

## 📚 プロジェクト概要

### 目的
FF14の釣りにおいて、以下を計算・最適化する：
- 特定の魚を釣る確率（ヒット率）
- 1匹釣るまでの期待時間
- GP（ギャザラーポイント）の持続可能性

### 主要機能
1. **手動設定モード**: 単一シナリオの詳細計算
2. **オプティマイザーモード**: 複数戦略の自動評価
3. **共有モード**: 設定をURLで共有

### 技術スタック
- **フロントエンド**: Vanilla JavaScript + Vite
- **データ**: JSON形式のマスターデータベース
- **計算エンジン**: `src/core/calculator.js`

---

## 🗂️ ディレクトリ構造

```
pj_FF14_Fisher-Logic-Engine/
├── foundation/              # AI引き継ぎ用（このディレクトリ）
│   ├── README.md           # このファイル
│   ├── core_formulas.md    # 核心計算式
│   └── rules_and_mechanics.md  # 不変ルール
│
├── docs/                   # 正本ドキュメント
│   ├── System_Spec.md      # システム仕様（インデックス）
│   ├── reference/
│   │   └── Game_Domain_Spec.md  # ゲームドメイン定義（219行）
│   └── specs/              # モジュール化された仕様群
│       ├── Logic_Core.md   # コア計算ロジック
│       ├── Logic_GP.md     # GP管理
│       ├── Domain_Mechanics.md
│       ├── Data_Schema.md
│       └── UI_UX_Spec.md
│
├── src/                    # 実装コード
│   ├── core/               # 純粋計算モジュール
│   │   ├── calculator.js   # メイン計算エンジン
│   │   ├── optimizer.js    # GP最適化
│   │   └── scenario.js     # シナリオID管理
│   ├── ui/                 # UIハンドリング
│   └── data/               # マスターデータ
│       └── logic_master.json
│
└── archive/                # 旧ドキュメント（参照のみ）
    └── plans_and_specs/
```

---

## 🔑 重要な前提知識

### 1. シナリオIDの理解

シナリオは以下のフォーマットで識別されます：

```
n{回数}_d{発見ステップ}_g{型確定ステップ}
```

**例**:
- `n0_d0_g0`: ルアー未使用
- `n2_d1_g2`: ルアー2回、1回目で発見、2回目で型確定
- `n3_d0_g12`: ルアー3回、発見なし、1回目と2回目で型確定

### 2. 計算の2つの軸

#### (A) 確率計算
- **シナリオ発生確率** ($P_{Scenario}$): そのシナリオが発生する確率
- **ヒット率** ($P_{Hit}$): シナリオ着地時に目的の魚が釣れる確率

#### (B) 時間計算
- **待機時間期待値**: ルアー拘束時間と魚の待機時間分布の積分
- **サイクル総時間**: 1回のキャストにかかる総時間

### 3. データの正本

**絶対に参照すべきマスターデータ**:
- `src/data/logic_master.json`: 全ての確率・重み・時間データ
- `docs/reference/Game_Domain_Spec.md`: 計算ロジックの根拠

---

## 🔧 よくある作業パターン

### パターン1: 新機能の追加

1. `docs/specs/` の該当仕様書を確認
2. `src/core/calculator.js` を修正
3. `src/ui/` でUI連携を実装
4. ローカルサーバーで動作確認: `npm run dev`

### パターン2: バグ修正

1. `docs/troubleshooting/` で過去の類似事例を検索
2. `foundation/core_formulas.md` で計算式を確認
3. `src/core/` の該当関数をデバッグ
4. 修正後、必ず `troubleshooting/` に記録

### パターン3: 仕様の確認

1. **計算式**: `foundation/core_formulas.md`
2. **詳細定義**: `docs/reference/Game_Domain_Spec.md`
3. **実装詳細**: `docs/specs/Logic_Core.md`

---

## 🚨 トラブルシューティング

### 問題: 計算結果が期待と異なる

**確認手順**:
1. `foundation/core_formulas.md` で計算式を確認
2. `src/core/calculator.js` の該当関数をトレース
3. `logic_master.json` のデータが正しいか確認

### 問題: 過去の仕様が不明

**確認手順**:
1. `docs/troubleshooting/` で過去のログを検索
2. `docs/reference/Game_Domain_Spec.md` で定義を確認
3. Git履歴を確認: `git log --all --grep="キーワード"`

### 問題: AI引き継ぎで情報が欠落

**対策**:
- このREADMEを最初に読むこと
- `foundation/core_formulas.md` は**絶対に要約しない**
- 不明点は `Game_Domain_Spec.md` の該当セクションを全文参照

---

## 📖 詳細仕様（必要に応じて参照）

### ゲームドメイン
- **[Game_Domain_Spec.md](../docs/reference/Game_Domain_Spec.md)** (219行)
  - 釣り場の構成と出現の論理階層
  - 重み抽選の基本概念
  - ルアー効果の32パターン定義
  - CSVデータ連携定義

### 計算ロジック
- **[Logic_Core.md](../docs/specs/Logic_Core.md)** (116行)
  - GDS定数定義
  - シナリオ管理
  - 重みとヒット率の計算
  - 時間計算モデル

### GP管理
- **[Logic_GP.md](../docs/specs/Logic_GP.md)**
  - スキルコスト表
  - 回復計算
  - 持続可能性指標

### データ構造
- **[Data_Schema.md](../docs/specs/Data_Schema.md)**
  - `logic_master.json` 構造定義
  - キーフォーマットと検索ルール

### UI/UX
- **[UI_UX_Spec.md](../docs/specs/UI_UX_Spec.md)**
  - 画面レイアウト構成
  - インタラクションフロー
  - エラーハンドリング

---

## 🎯 現在の開発状況

**最新情報**: `docs/Roadmap.md` を参照

**最近の主要変更**:
- v3.0: モジュラーアーキテクチャへの移行
- v3.1: GP管理ロジックの追加
- v3.2: 時間計算の積分モデル改訂
- v3.3: 共有モード実装

---

## ⚠️ 重要な注意事項

### AI更新時の絶対ルール

> [!CAUTION]
> **以下のドキュメントは絶対に要約・削除しないこと**
> 
> 1. `foundation/core_formulas.md` - 全セクション
> 2. `docs/reference/Game_Domain_Spec.md` - 計算式、定数表、CSVスキーマ
> 3. `docs/specs/Logic_Core.md` - 数式記号を含む全ての式
> 
> これらは実装の根拠となる正本です。情報欠落は致命的なバグを引き起こします。

### ドキュメント更新の原則

1. **Single Source of Truth**: `docs/` を正本とする
2. **バージョン管理**: 更新時は必ず `Version` と `Last Updated` を更新
3. **変更履歴**: 重要な変更は `CHANGELOG` セクションに記録

---

## 🔗 外部リソース

- **Git リポジトリ**: ローカル `.git` 管理
- **開発サーバー**: `http://localhost:3000` (Vite)
- **データソース**: FF14公式データ（CSV形式）

---

## 📝 このドキュメントについて

**Status**: CANONICAL (正本)  
**Maintenance**: プロジェクト構造変更時に更新  
**Owner**: プロジェクト全体の責任者

**更新履歴**:
- 2026-02-04: 初版作成（AI引き継ぎ問題の解決のため）
