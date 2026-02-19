---
STATUS: CANONICAL (正本)
IMMUTABLE_SECTIONS: [全セクション]
LAST_VERIFIED: 2026-02-04
SOURCE: scripts/generate-master.js, docs/specs/Data_Schema.md
---

# データ生成フロー - CSV to JSON

> [!CAUTION]
> **このドキュメントはデータ生成プロセスの正本です**
> 
> 全てのセクションは**絶対に要約・削除しないこと**。
> AI更新時は、必ず元の情報を保持してください。

**Purpose**: CSVからlogic_master.jsonを生成するプロセスを定義  
**Version**: 3.0.0  
**Last Updated**: 2026-02-04

---

## 1. データフロー概要

```
[CSVファイル群]
    ↓
[scripts/generate-master.js]
    ↓
[src/data/logic_master.json]
    ↓
[アプリケーション]
```

---

## 2. 必要なCSVファイル

### 2.1 ファイル一覧

**場所**: `src/data/csv/`

| ファイル名 | 用途 | 内部キー |
|:---|:---|:---|
| `マスタ - 1_魚種.csv` | 魚種の基本情報 | `fish` |
| `マスタ - 2_拡張・エリア定義.csv` | 釣り場の階層情報 | `hierarchy` |
| `マスタ - 3_釣り場定義.csv` | 釣り場の詳細情報 | `spots` |
| `マスタ - 4_基礎重み・基礎待機時間.csv` | 重みと待機時間 | `weights` |
| `マスタ - 5_発見・型確定・隠しヒット率.csv` | 確率データ | `probs` |
| `マスタ - 6_ルアー戦略プリセット.csv` | 戦略定義 | `presets` |

### 2.2 CSV形式の要件

- **エンコーディング**: UTF-8 (BOM付きでも可)
- **区切り文字**: カンマ (`,`)
- **ヘッダー**: 必須（1行目）
- **日本語**: 使用可能

---

## 3. 生成スクリプトの実行方法

### 3.1 コマンド

```bash
# プロジェクトルートで実行
node scripts/generate-master.js
```

### 3.2 前提条件

- **Node.js**: インストール済み
- **依存関係**: `csv-parse` パッケージ
  ```bash
  npm install
  ```

### 3.3 実行結果

**成功時の出力例**:
```
🎣 Starting Master Data Generation...
Reading: マスタ - 1_魚種.csv
Reading: マスタ - 2_拡張・エリア定義.csv
Reading: マスタ - 3_釣り場定義.csv
Reading: マスタ - 4_基礎重み・基礎待機時間.csv
Reading: マスタ - 5_発見・型確定・隠しヒット率.csv
Reading: マスタ - 6_ルアー戦略プリセット.csv
✅ Successfully generated src/data/logic_master.json
Summary:
- Spots: 5
- Fish: 12
- Probs: 24
```

---

## 4. 生成されるJSONの構造

### 4.1 ルートオブジェクト

```json
{
  "version": "3.0.0",
  "updated_at": "2026-02-04T09:00:00.000Z",
  "fish": { ... },
  "spots": { ... },
  "weights": { ... },
  "probabilities": [ ... ],
  "strategy_presets": [ ... ]
}
```

### 4.2 fish オブジェクト

**キー**: 魚名（日本語）

```json
"魚名": {
  "type": "small_jaws" | "large_jaws" | "medium_jaws",
  "vibration": "!" | "!!" | "!!!",
  "hook_time": 5.0,
  "is_hidden": false,
  "can_slap": true
}
```

**変換ルール**:
- `型` → `type`: `小型` → `small_jaws`, `大型` → `large_jaws`
- `隠し判定` → `is_hidden`: `1` → `true`, `0` → `false`
- `トレード可否` → `can_slap`: `1` → `true`, `0` → `false`

### 4.3 spots オブジェクト

**キー**: 釣り場名（日本語）

```json
"釣り場名": {
  "expansion": "黄金_7.x",
  "area": "エリア名",
  "weathers": ["快晴", "晴れ"],
  "baits": ["餌1", "餌2"],
  "fish_list": ["魚1", "魚2"]
}
```

**生成プロセス**:
1. `マスタ - 2_拡張・エリア定義.csv` から初期化
2. `マスタ - 3_釣り場定義.csv` から詳細を集約

### 4.4 weights オブジェクト

**キー**: `釣り場|天気 / 時間|餌` (複合キー)

```json
"釣り場|快晴|餌1": [
  {
    "fish": "魚名",
    "weight": 100,
    "bite_time_min": 8,
    "bite_time_max": 14
  }
]
```

**重要**: このキーフォーマットは `calculator.js` での検索に使用される

### 4.5 probabilities 配列

```json
[
  {
    "spot": "釣り場",
    "weather": "快晴",
    "bait": "餌1",
    "target_hidden": "隠し魚名" | null,
    "slap_target": "トレード対象",
    "lure_type": "アンビシャス",
    "disc_rates": [35, 45, 55],
    "guar_rates_nodisc": [20, 30, 40],
    "guar_rates_after_disc": {
      "d1_g2": 50,
      "d1_g3": 60,
      "d2_g3": 70
    },
    "hidden_hit_rates": {
      "n1_d1_g0": 25,
      "n2_d1_g2": 40,
      "n3_d1_g3": 55
    }
  }
]
```

**パーセント変換**:
- CSV: `35%` → JSON: `35` (数値)
- 空欄: `null`

### 4.6 strategy_presets 配列

```json
[
  {
    "id": "L2_fixed",
    "name": "L2固定",
    "description": "ルアー2回で確実に釣る戦略",
    "eligible_scenarios": ["n2_d1_g2", "n2_d2_g0"]
  }
]
```

---

## 5. データ変換の詳細ルール

### 5.1 型の正規化

| CSV表記 | JSON Code |
|:---|:---|
| `小型` | `small_jaws` |
| `大型` | `large_jaws` |
| `中型` | `medium_jaws` |

### 5.2 真偽値の変換

| CSV値 | JSON値 |
|:---|:---|
| `1` | `true` |
| `0` | `false` |
| 空欄 | `false` |

### 5.3 パーセント値の変換

| CSV値 | JSON値 |
|:---|:---|
| `35%` | `35` (Number) |
| `0%` | `0` (Number) |
| 空欄 | `null` |

### 5.4 隠しヒット率のマッピング

**CSVヘッダー → JSONキー**:

| CSVヘッダー | JSONキー |
|:---|:---|
| `発見1型確1なし隠しヒット率1` | `n1_d1_g0` |
| `発見1型確2あり隠しヒット率2` | `n2_d1_g2` |
| `発見1型確2なし隠しヒット率2` | `n2_d1_g0` |
| `発見1型確3あり隠しヒット率3` | `n3_d1_g3` |
| `発見1型確3なし隠しヒット率3` | `n3_d1_g0` |
| `発見2型確2なし隠しヒット率2` | `n2_d2_g0` |
| `発見2型確3あり隠しヒット率3` | `n3_d2_g3` |
| `発見2型確3なし隠しヒット率3` | `n3_d2_g0` |
| `発見3型確3なし隠しヒット率3` | `n3_d3_g0` |

**フォーマット**: `n{ルアー回数}_d{発見ステップ}_g{型確定ステップ}`

---

## 6. エラーハンドリング

### 6.1 ファイルが見つからない場合

```
Error: File not found: src/data/csv/マスタ - 1_魚種.csv
```

**対処法**: 必要なCSVファイルが全て存在するか確認

### 6.2 CSV形式エラー

**症状**: パースエラー

**対処法**:
1. UTF-8エンコーディングを確認
2. カンマ区切りを確認
3. ヘッダー行の存在を確認

### 6.3 データ不整合の警告

```
Warning: Spot '釣り場X' definition found in details but not in hierarchy.
```

**対処法**: `マスタ - 2_拡張・エリア定義.csv` に該当釣り場を追加

---

## 7. データ更新のワークフロー

### 7.1 標準手順

1. **CSVファイルを編集**
   - `src/data/csv/` 内の該当ファイルを更新
   - Google Sheets等で管理している場合はエクスポート

2. **生成スクリプトを実行**
   ```bash
   node scripts/generate-master.js
   ```

3. **結果を確認**
   - `src/data/logic_master.json` が更新されたことを確認
   - Summary出力で件数を確認

4. **動作確認**
   ```bash
   npm run dev
   ```
   - ブラウザでアプリケーションを開いて動作確認

5. **コミット**
   ```bash
   git add src/data/
   git commit -m "データ更新: [変更内容]"
   ```

### 7.2 検証スクリプト

**オプション**: 生成後の検証

```bash
node scripts/validate-master.js
```

**検証内容**:
- JSONの構造チェック
- 必須フィールドの存在確認
- データ型の妥当性確認

---

## 8. トラブルシューティング

### 8.1 BOM (Byte Order Mark) の問題

**症状**: CSVの1列目が正しく認識されない

**原因**: UTF-8 BOM付きファイル

**対処**: スクリプトが自動的にBOMを除去（Line 36）
```javascript
const cleanContent = fileContent.replace(/^\uFEFF/, '');
```

### 8.2 空行の扱い

**設定**: 自動的にスキップ（Line 40）
```javascript
skip_empty_lines: true
```

### 8.3 前後の空白

**設定**: 自動的にトリム（Line 41）
```javascript
trim: true
```

---

## 9. 実装ファイルの場所

| ファイル | 役割 |
|:---|:---|
| `scripts/generate-master.js` | 生成スクリプト（正本） |
| `scripts/validate-master.js` | 検証スクリプト |
| `src/data/csv/*.csv` | ソースデータ（CSV） |
| `src/data/logic_master.json` | 生成されたJSON（使用される正本） |
| `docs/specs/Data_Schema.md` | JSONスキーマ仕様書 |

---

## 10. 重要な注意事項

### 10.1 手動編集の禁止

> [!WARNING]
> **`logic_master.json` を直接編集しないこと**
> 
> 必ずCSVファイルを編集してから `generate-master.js` を実行してください。
> 手動編集は次回の生成時に上書きされます。

### 10.2 CSVファイルの正本

**Google Sheets**: `マスタ.gsheet` がリンクファイル

CSVファイルはGoogle Sheetsからエクスポートされたものである可能性が高い。
更新時はGoogle Sheetsを編集してからエクスポートすること。

### 10.3 バージョン管理

`logic_master.json` の `version` フィールドは自動的に設定されない。
必要に応じて `generate-master.js` の Line 47 を更新すること。

---

## CHANGELOG

- **2026-02-04**: 初版作成（AI引き継ぎ問題の解決のため、generate-master.js と Data_Schema.md から抽出）
