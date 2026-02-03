# データ仕様書: logic_master.json

本書は、エンジンで使用される静的データファイルのスキーマと構造を定義する。
ファイル: `src/data/logic_master.json`

## 1. スキーマ概要

ルートオブジェクトはバージョン情報と、3つの主要なデータ辞書を含む。

```json
{
  "version": "3.0.0",
  "updated_at": "ISO-8601 String",
  "fish": { ... },
  "spots": { ... },
  "weights": { ... },
  "probabilities": [ ... ]
}
```

## 2. 詳細構造

### 2.1 魚辞書 (`fish`)
キー: **魚名 (Fish Name)** (String)

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `type` | String | `small_jaws` (小型) または `large_jaws` (大型)。 |
| `vibration` | String | `!`, `!!`, `!!!`。 |
| `hook_time` | Number | フッキング動作にかかる時間 (秒)。 |
| `is_hidden` | Boolean | 発見状態が必要な隠し魚なら `true`。 |
| `can_slap` | Boolean | トレードリリース可能なら `true`。 |

### 2.2 釣り場辞書 (`spots`)
キー: **釣り場名 (Spot Name)** (String)

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `expansion` | String | 拡張パッケージ名 (例: "黄金_7.x")。 |
| `area` | String | エリア/ゾーン名。 |
| `weathers` | Array | 利用可能な天気のリスト。 |
| `baits` | Array | 利用可能な餌のリスト。 |
| `fish_list` | Array | この釣り場に生息する魚名のリスト。 |

### 2.3 重み辞書 (`weights`)
キー: **複合キー文字列**: `釣り場名|天気|餌`

値: オブジェクトの配列
```json
[
  {
    "fish": "魚名",
    "weight": 100,       // 基礎重み (Base Weight)
    "bite_time_min": 8,  // 最小待機時間
    "bite_time_max": 14  // 最大待機時間
  },
  ...
]
```

### 2.4 メカニクス確率 (`probabilities`)
ルアー/シナリオ計算を可能にするルールオブジェクトの配列。
ルアーアクションごとの成功率を参照するために使用される。

**検索キー**: `釣り場|天気|餌|ルアー種別|トレード対象`
(`calculator.js` 内で実行時に構築される)

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `disc_rates` | Array[3] | Step 1, 2, 3 の発見確率 (% 0-100)。 |
| `guar_rates_nodisc` | Array[3] | 未発見状態での型確定確率 (%)。 |
| `guar_rates_after_disc` | Object | 発見**後**の型確定確率マップ。キー: `d{step}_g{step}`。 |
| `hidden_hit_rates` | Object | シナリオごとの隠し魚ヒット率マップ。キー: `n{}_d{}_g{}`。 |
| `target_hidden` | String | このルールに関連付けられた隠し魚の名前。 |
