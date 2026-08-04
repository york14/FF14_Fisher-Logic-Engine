# 2026-08-04 見切り時間の2パラメータ化（上限・下限見切り時間の実装）

## 概要
* **日時**: 2026-08-04
* **対象プロジェクト**: pj_FF14_Fisher-Logic-Engine
* **対応内容**:
  1. マスタデータの更新（CSV → JSON反映）
  2. 見切り時間パラメータの用語定義と命名決定
  3. コアロジックの3ゾーン分割アルゴリズムへの刷新
  4. UI・結果表示・シリアライズの全面改修

## 背景
従来の「見切り時間（`macroLimitTime`）」は上限見切り（指定秒数経過後に竿上げ中断）のみをサポートしていた。
実際のFF14の釣りでは、**早いアタリを見送って竿上げする（下限見切り）** という戦略も存在するため、2種類の見切り時間を独立して設定できるよう拡張した。

### 用語の定義
* **竿上げ**: 魚を釣り上げずに竿を上げて中断する行動。動作時間2秒（`tRest = 2.0`）。
* **上限見切り時間**: ○秒経過したら竿上げ中断。遅い外道を切り捨てる用途。
* **下限見切り時間**: ○秒以下のヒットは竿上げ中断。早い外道を切り捨てる用途。

## 詳細

### 1. マスタデータの更新
`src/data/csv` 配下のCSV更新を受け、`node scripts/generate-master.js` を実行し `logic_master.json` へ適用。
（Spots: 7, Fish: 29, Probs: 58）

### 2. パラメータ名のリネームと追加

| 旧名 | 新名 | 用途 |
|---|---|---|
| `macroLimitTime` | `limitMaxTime` | 上限見切り時間（秒） |
| （新規） | `limitMinTime` | 下限見切り時間（秒） |

HTML要素IDも同様にリネーム:
* 共通設定: `macroLimitTime` → `limitMaxTime` / `limitMinTime`（新規）
* Set A: `stratAMacroLimit` → `stratALimitMax` / `stratALimitMin`（新規）
* Set B: `stratBMacroLimit` → `stratBLimitMax` / `stratBLimitMin`（新規）

### 3. コアロジックの刷新 (`src/core/calculator.js`)
従来の上限のみの `if-else` 分岐を廃止し、**3ゾーン分割アルゴリズム** に書き換えた。

魚のヒット時間 `[t_min, t_max]` を以下の3ゾーンに分割して確率・待機時間を計算:
1. **Zone 1 (`t < limitMin`)**: 下限見切り → 竿上げ中断（2秒）。`cancelLowRatio` として確率計上。
2. **Zone 2 (`limitMin ≤ t ≤ limitMax`)**: 有効範囲 → 釣獲対象。`catchRatio` として確率計上。
3. **Zone 3 (`t > limitMax`)**: 上限見切り → タイムアウト竿上げ中断（2秒）。`cancelHighRatio` として確率計上。

各ゾーンの平均待機時間を個別に計算し、ルアー待機時間（`L`）との積分処理も Zone 2 の `effLow`〜`effHigh` 範囲で正しく行うよう改修。

`allFishStats` に `cancelLowRatio`, `cancelHighRatio` を追加し、サイクル時間の期待値にも各キャンセルパターンの重み付けを反映:
```
sumProbTotalCycle += (actualHitProb * cycleTime)
                   + (cancelLowProb * cancelLowCycleTime)
                   + (cancelHighProb * cancelHighCycleTime)
```

### 4. UI改修 (`index.html`)
共通設定・Set A・Set B の見切り時間入力欄を、それぞれ「上限見切り時間」「下限見切り時間」の2つに分割。

### 5. イベントリスナー・シリアライズの更新 (`src/main.js`)
* `setupEventListeners` 内の変更検知対象IDを新名に変更。
* `serializeStateToURL` / `initShareMode` のデータ項目を `limitMaxTime`, `limitMinTime`, `limitMax`, `limitMin` に変更。
* `updateSimulation` 内の `config` 構築、`runStrategyMode` / `runStrategyModeVariable` 内の `setConfig` 構築もすべて新名に変更。

### 6. 結果表示の更新 (`src/ui/render.js`)
* 手動設定の結果フッターに「上限見切り時間：○秒経過したら竿上げ中断」「下限見切り時間：○秒以下のヒットは竿上げ中断」を表示。
* L戦略評価の各カード内にも同様に「上限見切り」「下限見切り」の2行を表示。
* デバッグパネルの検索キー表示も `Limit Max` / `Limit Min` に変更。

## 改修ファイル一覧
* `src/core/calculator.js` — コアロジック3ゾーン分割
* `index.html` — UI入力欄の2分割
* `src/main.js` — パラメータ名変更・イベント・シリアライズ
* `src/ui/render.js` — 結果表示の名称・説明文変更

## ステータス
* ビルド: ✅ 成功（Vite v6.4.1, エラーなし）
* 動作確認: ⬜ 未実施（次ステップで実施予定）
