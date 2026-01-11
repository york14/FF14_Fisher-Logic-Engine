
# Fisher Logic Engine (FLE) Simulator  
## 詳細仕様書・設計書（コード準拠版 / Step2）

---

## 0. 本書の目的と前提

本書は以下を目的とする。

- 本プロジェクトを**一切知らない第三者**が読んでも理解できること
- **index.html / main.js / logic_master.json** に記述された内容を、
  - 定数
  - 変数
  - code key
  - 関数
  - 計算式
  
  の単位で**完全に説明**すること
- AI（LLM）に与えた際、**同一ロジックを再実装できる粒度**であること

本書は既存の `FLE_System_Spec.md` の文体・粒度を踏襲し、  
途中まで同一内容を含みつつ、その続きを補完する形で記述する。

---

## 1. システム全体構成

### 1.1 ファイル構成

```
/
├ index.html          # UI構造定義
├ assets/
│  ├ main.js          # ロジック・制御・計算
│  └ style.css        # 表示スタイル
└ logic_master.json   # ゲームルール・確率データ
```

### 1.2 責務分離方針

| ファイル | 主責務 |
|--------|-------|
| index.html | UI構造・入力項目 |
| style.css | 視覚表現 |
| main.js | 状態管理・計算・描画 |
| logic_master.json | 仕様データ（非コード） |

**重要原則**  
- 確率・ルールは全て JSON 側に存在する  
- JS は「読む・計算する・表示する」だけ

---

## 2. グローバル定数定義（GDS）

```js
const GDS = {
  D_CAST: 1.0,
  D_LURE: 2.5,
  D_BLK: 2.5,
  D_CHUM: 1.0,
  D_REST: 2.0,
  C_CHUM: 0.6,
  M_N1: 1.5,
  M_N2: 2.0,
  M_N3: 6.0
};
```

### 2.1 時間系定数（秒）

| 定数 | 意味 |
|----|----|
| D_CAST | キャスト動作時間 |
| D_LURE | ルアー1回あたりの操作時間 |
| D_BLK | ルアー終了後の硬直時間 |
| D_CHUM | 撒き餌使用動作 |
| D_REST | 外道時の竿上げ時間 |

### 2.2 補正定数

| 定数 | 意味 |
|----|----|
| C_CHUM | 撒き餌時のバイト時間短縮倍率 |
| M_N1 | ルアー1回時の重み倍率 |
| M_N2 | ルアー2回時の重み倍率 |
| M_N3 | ルアー3回時の重み倍率 |

---

## 3. UI入力と内部変数対応

### 3.1 共通設定

| UI ID | 内部変数 | 説明 |
|----|----|----|
| currentSpot | config.spot | 釣り場 |
| currentWeather | config.weather | 天候 |
| currentBait | config.bait | 餌 |
| targetFishName | config.target | ターゲット魚 |
| isCatchAll | config.isCatchAll | 外道も釣るか |

---

## 4. ルアーシナリオID仕様

### 4.1 フォーマット

```
n{回数}_d{発見step}_g{型確定step列}
```

例：

| ID | 意味 |
|--|--|
| none_0 | ルアー未使用 |
| n2_d1_g0 | 2回使用、1回目発見、型確定なし |
| n3_d1_g23 | 3回使用、1回目発見、2・3回目型確定 |

### 4.2 parseScenarioId の責務

- n : 使用回数
- d : 発見ステップ（0 or 1回のみ）
- g : 型確定ステップ配列
- isNone : ルアー未使用判定

---

## 5. 確率データ参照キー

```text
spot|weather|bait|lure_type|trade_target
```

例：

```
アレクサンドリア旧市街|霧晴れ12-16|紅サシ|アンビシャスルアー|なし
```

このキーで `probabilityMap` により高速検索される。

---

## 6. シナリオ確率計算

### 6.1 基本式

各ステップの確率を逐次乗算する。

```
P(scenario) = Π P(step_i | 過去状態)
```

### 6.2 発見前ステップ

- P(発見) = disc_rates[i]
- P(型確定) = (1 - P(発見)) × guar_rates_nodisc[i]
- P(何もなし) = 残り

### 6.3 発見後ステップ

```
P(型確定) = guar_rates_after_disc[dX_gY]
```

---

## 7. 隠し魚確率

### 7.1 定義

- 通常抽選とは独立
- シナリオIDごとに直接確率指定

```
P(hidden) = hidden_hit_rates[scenarioId]
```

### 7.2 通常魚確率

```
P(fish) = (finalWeight / ΣWeight) × (1 - P(hidden))
```

---

## 8. 重み計算ロジック

### 8.1 基礎重み

logic_master.json の weights 定義を使用。

### 8.2 補正処理順

1. トレード対象 → weight = 0
2. ルアー一致 → × M_N*
3. 型確定ミスマッチ → weight = 0

---

## 9. 待機時間計算

```
waitTime = max(biteTime, lureTime)
```

### 9.1 biteTime

```
biteTime = baseBite × (撒き餌 ? C_CHUM : 1.0)
```

### 9.2 lureTime

```
lureTime = D_CAST + (n × D_LURE) + D_BLK
```

---

## 10. サイクル時間

```
cycleTime = D_CAST + waitTime + hookTime + (撒き餌 ? D_CHUM : 0)
```

- hookTime はターゲット or CatchAll 判定で分岐

---

## 11. 期待待機時間

### 11.1 定義

```
Expected = (E[Cycle] - (P × hookTime)) / P
```

### 11.2 意味

- 成功時の「釣り上げ動作」を除外
- 純粋にヒットするまでの待機時間

---

## 12. 戦略評価モード

### 12.1 戦略プリセット

- 複数シナリオの集合
- 確率加重平均で評価

### 12.2 集計値

- avgHitRate
- avgCycle
- expectedTime
- avgCastCount

---

## 13. 設計思想まとめ

- 確率は**与えられるもの**
- JSは**一切推測しない**
- 全数値は**説明可能である必要がある**

---

## 14. 本書の想定読者

- 実装者
- バランス設計者
- 数理解析者
- AI（LLM）

---

以上。
