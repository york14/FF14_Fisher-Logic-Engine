プロジェクトを分析した結果、以下の3つのドキュメントを作成しました:

1. **システム仕様書 (SPECIFICATION.md)** - システム全体の概要、機能、データ構造
2. **設計書 (DESIGN.md)** - アーキテクチャ、計算ロジック、UI設計
3. **用語集 (GLOSSARY.md)** - ゲーム用語とプロジェクト固有用語の定義

これらのドキュメントがあれば、プロジェクトを知らない人やAIでもシステムの全体像を理解できます。

<artifact identifier="fle-docs" type="application/vnd.ant.code" language="markdown" title="FLE System Documentation">
# システム仕様書 (SPECIFICATION.md)

## プロジェクト概要

**プロジェクト名**: Fisher Logic Engine (FLE) Simulator  
**バージョン**: v2.3.2  
**目的**: FF14における釣りの抽選論理をシミュレートし、ターゲット魚を最短時間で獲得するための最適スキル使用戦略を科学的に検討・提示する

## システム構成

### ファイル構成
```
project/
├── index.html          # メインHTML (UI構造)
├── assets/
│   ├── main.js        # アプリケーションロジック
│   └── style.css      # スタイルシート
└── logic_master.json  # マスターデータ (釣り場・魚・確率データ)
```

### 技術スタック
- **フロントエンド**: Vanilla JavaScript (ES6+)
- **UI**: HTML5 + CSS3 (カスタムCSS変数)
- **データ形式**: JSON
- **動作環境**: モダンブラウザ (Chrome, Firefox, Safari, Edge)

---

## 機能仕様

### 1. 手動設定モード (Manual Mode)

**目的**: 特定の条件とスキル結果を手動で設定し、その一点における効率を評価

**主要機能**:
- 釣り場・天気・餌・ターゲット魚の選択
- ルアー使用設定 (回数、各ステップのアクション)
- トレード対象魚の指定
- 撒き餌の使用/未使用切り替え
- Catch All モード (外道も全て釣り上げる)

**出力結果**:
- **ターゲットヒット時間期待値** (秒): ターゲット1匹を釣るまでの正味待機時間
- **ターゲットヒット率** (%): 1キャストでターゲットが釣れる確率
- **魚種別詳細テーブル**: 各魚のヒット率、待機時間、サイクル時間
- **シナリオ発生確率**: 設定したルアー結果パターンが発生する確率
- **平均サイクル時間**: 1回の釣りサイクルにかかる平均時間

**詳細ビュー** (右パネル):
- 定数一覧 (D_CAST, D_LURE, etc.)
- シナリオ解析 (検索キー、発見率、型確定率)
- 重み・確率分配の内訳
- ターゲットのサイクル時間内訳
- 期待値計算の詳細式

### 2. 戦略評価モード (Strategy Mode)

**目的**: 戦略パターン全体の期待値を評価し、2つの戦略を比較

**主要機能**:
- 2つの戦略セット (Set A / Set B) の並列評価
- 戦略プリセットの選択 (L2固定、L3固定、発見延長優先、etc.)
- 各戦略ごとのルアー種類・トレード・撒き餌設定

**出力結果**:
- **ターゲット期待待機時間** (秒): 戦略全体の期待値
- **平均ヒット率** (%): 全シナリオの加重平均
- **平均サイクル時間** (秒): 全シナリオの加重平均
- **発生確率Top3**: 確率の高いシナリオ3つ
- **ヒット率Top3**: ターゲットヒット率の高いシナリオ3つ

**詳細ビュー** (右パネル):
- 全シナリオ一覧テーブル (確率順ソート)
- 各シナリオの発生確率、ヒット率、サイクル時間、期待値

---

## データ仕様

### logic_master.json 構造

#### 1. fish (魚マスタ)
```json
{
  "魚名": {
    "type": "small_jaws | large_jaws",  // 魚の型
    "vibration": "! | !! | !!!",         // 演出
    "hook_time": 5,                      // 釣り上げ動作時間 (秒)
    "is_hidden": false,                  // 隠し魚フラグ
    "can_trade": true                    // トレード可能フラグ
  }
}
```

#### 2. spots (釣り場マスタ)
```json
{
  "釣り場名": {
    "weathers": ["天気1", "天気2"],      // 利用可能な天気条件
    "baits": ["餌1", "餌2"],             // 利用可能な餌
    "fish_list": ["魚A", "魚B"]          // 出現魚リスト
  }
}
```

#### 3. weights (基礎重み・バイト時間)
```json
{
  "釣り場|天気|餌": [
    {
      "fish": "魚名",
      "weight": 200,        // 基礎重み
      "bite_time": 10       // 基礎バイト時間 (秒)
    }
  ]
}
```

#### 4. probabilities (ルアー確率データ)
```json
{
  "spot": "釣り場",
  "weather": "天気",
  "bait": "餌",
  "target_hidden": "隠し魚名 | なし",
  "trade_target": "トレード対象魚 | なし",
  "lure_type": "アンビシャスルアー | モデストルアー",
  
  "disc_rates": [23.11, 24.72, 27.42],           // 各ステップの発見率 (%)
  "guar_rates_nodisc": [3.28, 8.79, 12.38],     // 未発見時の型確定率 (%)
  
  "guar_rates_after_disc": {                     // 発見後の型確定率 (%)
    "d1_g2": 10.21,  // 1回目発見 → 2回目型確定
    "d1_g3": 21.53,  // 1回目発見 → 3回目型確定
    "d2_g3": 21.64   // 2回目発見 → 3回目型確定
  },
  
  "hidden_hit_rates": {                          // 隠し魚ヒット率 (%)
    "n1_d1_g0": 16.28,  // 1回使用、1回目発見、型確定なし
    "n2_d1_g2": 7.14,   // 2回使用、1回目発見、2回目型確定
    // ... (全32パターン)
  }
}
```

#### 5. strategy_presets (戦略プリセット)
```json
{
  "id": "fixed_l2",
  "name": "L2固定",
  "description": "状況に関わらず必ず2回使用して待機",
  "eligible_scenarios": [
    "n2_d0_g0", "n2_d0_g1", "n2_d0_g2", ...
  ]
}
```

---

## 定数定義 (GDS - Game Duration Standards)

```javascript
const GDS = {
    D_CAST: 1.0,    // キャスト動作時間 (秒)
    D_LURE: 2.5,    // ルアー1回の動作時間 (秒)
    D_BLK: 2.5,     // ルアー後の硬直時間 (秒)
    D_CHUM: 1.0,    // 撒き餌使用動作時間 (秒)
    D_REST: 2.0,    // 竿上げ動作時間 (秒)
    C_CHUM: 0.6,    // 撒き餌によるバイト時間補正係数
    M_N1: 1.5,      // ルアー1回使用時の重み補正倍率
    M_N2: 2.0,      // ルアー2回使用時の重み補正倍率
    M_N3: 6.0       // ルアー3回使用時の重み補正倍率
};
```

---

## シナリオID命名規則

**形式**: `n{使用回数}_d{発見ステップ}_g{型確定ステップ列}`

**例**:
- `none_0`: ルアー未使用 (素振り)
- `n2_d0_g0`: 2回使用、発見なし、型確定なし
- `n2_d1_g2`: 2回使用、1回目発見、2回目型確定
- `n3_d1_g23`: 3回使用、1回目発見、2回目と3回目で型確定
- `n3_d2_g3`: 3回使用、2回目発見、3回目型確定

**特殊ケース**:
- 発見は最大1回まで (d0 または d1, d2, d3 のいずれか1つ)
- 型確定は複数回可能 (g0, g1, g2, g3, g12, g13, g23, g123)

---

## 制約事項

### 現在のバージョンの制限
1. **GP (ギャザラーポイント) は考慮しない**: 時間効率の理論最大値のみを計算
2. **単一ターゲットのみ**: 複数魚種の同時最適化には未対応
3. **ブラウザストレージ未使用**: セッション間でのデータ保存機能なし
4. **静的データ**: logic_master.json の手動アップロードが必要

### データ要件
- probabilities配列は全ての条件組み合わせを網羅する必要がある
- NULL値を含むデータはエラーとして処理される
- 隠し魚のヒット率は全32シナリオ分のデータが必須

---

## エラーハンドリング

### 検出されるエラー
1. **データ不足エラー**: `disc_rates[idx] === null`
2. **条件不一致エラー**: 該当する確率データが存在しない
3. **シナリオデータ欠損**: `hidden_hit_rates[scenarioId] === null`
4. **JSON読み込みエラー**: 不正なJSON形式

### エラー表示
- 手動モード: 結果テーブルに赤字でエラーメッセージ表示
- 戦略モード: カードに警告アイコンとエラー内容表示
- 詳細ビュー: エラー発生箇所をトレース表示

---

## UI仕様

### レイアウト構成
```
┌─────────────────────────────────────────────────┐
│  Header (FISHER LOGIC ENGINE v2.0)              │
├──────────┬───────────────────────┬──────────────┤
│  Left    │  Center               │  Right       │
│  Panel   │  Panel                │  Panel       │
│  (設定)  │  (結果)               │  (詳細)      │
│  360px   │  Flex-grow            │  420px       │
│          │  max-width: 720px     │  (折りたたみ可) │
└──────────┴───────────────────────┴──────────────┘
```

### カラーテーマ
```css
--primary: #3b82f6       /* メインアクセント (青) */
--bg-dark: #0f172a       /* 背景 (ダークネイビー) */
--panel-bg: #1e293b      /* パネル背景 */
--text-main: #f1f5f9     /* メインテキスト */
--text-muted: #94a3b8    /* サブテキスト */
--accent-green: #10b981  /* 成功/オンライン */
--accent-red: #ef4444    /* エラー/オフライン */
--accent-a: #60a5fa      /* Set A (青系) */
--accent-b: #f472b6      /* Set B (ピンク系) */
```

### リサイザー機能
- 左パネル: 300px 〜 600px
- 右パネル: 320px 〜 600px
- ドラッグ操作でリアルタイム調整可能

---

## パフォーマンス最適化

### 実装済み最適化
1. **確率データの高速検索**: `probabilityMap` (Map型) によるO(1)検索
2. **イベントリスナーの適切な管理**: `addEventListener` / `removeEventListener` のペア管理
3. **DOM操作の最小化**: `innerHTML` による一括更新
4. **計算結果のキャッシング**: 戦略評価時の重複計算を回避

### 推奨される最適化 (未実装)
- 戦略評価の Web Worker 化
- 大規模データセットに対する仮想スクロール
- ユーザー設定のlocalStorage保存 (現在は制約により未実装)

---

## ブラウザ互換性

### 必須機能
- ES6+ (const, let, arrow function, template literals)
- FileReader API (JSONアップロード)
- CSS Variables
- Flexbox

### 推奨ブラウザ
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

**文書履歴**:
- 2026/01/11: v2.3.2 仕様書作成
- ステップ2完了時点の仕様を反映

---

# 設計書 (DESIGN.md)

## アーキテクチャ概要

### MVC的な責務分離

```
┌─────────────────────────────────────────┐
│  View Layer (index.html + style.css)   │
│  - UI構造の定義                          │
│  - スタイリング                          │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  Controller Layer (main.js)             │
│  - イベントハンドリング                  │
│  - UI更新制御                            │
│  - データフロー管理                      │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  Model Layer (main.js + JSON)           │
│  - ビジネスロジック (計算エンジン)       │
│  - データ構造 (masterDB, probabilityMap) │
└─────────────────────────────────────────┘
```

---

## データフロー

### 初期化フロー
```
User Action: JSONファイル選択
    ↓
handleFileUpload()
    ↓
FileReader.readAsText()
    ↓
JSON.parse() → masterDB
    ↓
generateProbabilityMap() → probabilityMap (Map型)
    ↓
enableControls() + populateSelectors()
    ↓
updateSimulation()
```

### 手動モード計算フロー
```
User Input: 設定変更
    ↓
updateSimulation()
    ↓
constructScenarioId() → "n2_d1_g2"
    ↓
calculateScenarioStats(config, scenarioId, isChum, tradeFish)
    ├─ parseScenarioId() → { n: 2, d: 1, g: [2] }
    ├─ 確率データ検索 (probabilityMap)
    ├─ シナリオ確率計算 (ベイズ的な条件付き確率)
    ├─ 重み補正計算 (ルアー種類・型確定状態に応じた倍率)
    ├─ 各魚のヒット率・待機時間・サイクル時間計算
    └─ ターゲット期待値計算
    ↓
renderResultTable() + renderDebugDetails()
```

### 戦略モード計算フロー
```
User Input: 戦略設定変更
    ↓
updateSimulation() → runStrategyMode()
    ↓
calculateStrategySet() (Set A / Set B それぞれ)
    ├─ プリセット読み込み
    ├─ eligible_scenarios をループ
    │   └─ 各シナリオで calculateScenarioStats()
    ├─ 加重平均計算 (確率 × 各指標)
    └─ 戦略全体の期待値算出
    ↓
renderStrategyComparison()
```

---

## 核心計算ロジック

### 1. シナリオ確率の計算

**目的**: 設定したルアー使用パターンが実際に発生する確率を計算

**アルゴリズム**:
```javascript
scenarioProb = 1.0;

for (各ステップ i = 1 to n) {
    if (未発見) {
        pDisc = disc_rates[i-1] / 100;
        pGuar = guar_rates_nodisc[i-1] / 100;
        
        if (このステップで発見) {
            stepProb = pDisc;
        } else if (このステップで型確定) {
            stepProb = (1 - pDisc) × pGuar;
        } else {
            stepProb = (1 - pDisc) × (1 - pGuar);
        }
    } else {
        // 発見済み
        pGuarAfter = guar_rates_after_disc["d{発見ステップ}_g{i}"] / 100;
        
        if (このステップで型確定) {
            stepProb = pGuarAfter;
        } else {
            stepProb = 1 - pGuarAfter;
        }
    }
    
    scenarioProb *= stepProb;
}
```

**例**: `n2_d1_g2` (2回使用、1回目発見、2回目型確定)
```
Step 1: 発見が起こる確率 = disc_rates[0] = 23.11%
Step 2: 発見後に型確定が起こる確率 = guar_rates_after_disc["d1_g2"] = 10.21%

シナリオ確率 = 0.2311 × 0.1021 = 2.36%
```

### 2. 重み補正の計算

**目的**: ルアー使用状況に応じて各魚の出現重みを動的に変更

**ルール**:
1. **トレード対象魚**: 重み = 0 (出現しない)
2. **型確定時の不一致魚**: 重み = 0
3. **ルアー使用時の一致魚**: 重み × M_N{n} (1.5x, 2.0x, 6.0x)
4. **その他**: 重み × 1.0 (変化なし)

**疑似コード**:
```javascript
for (各魚 w) {
    if (w.fish === tradeFish) {
        m = 0;
    } else if (lureType !== 'none') {
        if (魚の型 === ルアー対象型) {
            if (最後のステップで型確定) {
                m = M_N{n};  // 大幅増加
            } else {
                m = M_N{n};  // 通常増加
            }
        } else {
            if (最後のステップで型確定) {
                m = 0;  // 不一致魚は消える
            } else {
                m = 1.0;
            }
        }
    } else {
        m = 1.0;
    }
    
    finalWeight = baseWeight × m;
}
```

### 3. 隠し魚ヒット率の適用

**仕組み**:
- 隠し魚は `weights` では `weight: 0` として扱われる
- `hidden_hit_rates[scenarioId]` に直接確率が格納されている
- 通常魚の確率 = `(finalWeight / totalWeight) × (1 - pHidden)`
- 隠し魚の確率 = `pHidden`

**計算例**:
```
totalWeight = 560 (通常魚の合計)
pHidden = 16.28% (シナリオ n1_d1_g0 での隠し魚率)

魚A: (200 / 560) × (1 - 0.1628) = 29.86%
魚B: (160 / 560) × (1 - 0.1628) = 23.89%
魚C: (200 / 560) × (1 - 0.1628) = 29.86%
隠し魚: 16.28%

合計 = 99.89% ≈ 100%
```

### 4. サイクル時間の計算

**定義**: 1回の釣りサイクル全体にかかる時間

**式**:
```
cycleTime = D_CHUM (撒き餌使用時のみ)
          + D_CAST (1.0s)
          + waitTime
          + hookTime

waitTime = max(biteTime, lureTime)

biteTime = baseBiteTime × C_CHUM (撒き餌使用時は 0.6倍)
         = baseBiteTime (未使用時)

lureTime = D_CAST + (n × D_LURE) + D_BLK
         = 1.0 + (n × 2.5) + 2.5  (n > 0)
         = 0  (n = 0, 素振り)

hookTime = fish.hook_time (ターゲット or Catch All)
         = D_REST (2.0s)  (外道リリース時)
```

**計算例** (撒き餌あり、ルアー2回、ターゲット):
```
baseBiteTime = 10s
biteTime = 10 × 0.6 = 6s
lureTime = 1.0 + (2 × 2.5) + 2.5 = 8.5s
waitTime = max(6, 8.5) = 8.5s
hookTime = 5s (ターゲット魚)

cycleTime = 1.0 (撒き餌) + 1.0 (キャスト) + 8.5 (待機) + 5.0 (釣り上げ)
          = 15.5s
```

### 5. ターゲット期待待機時間の計算

**定義**: ターゲット1匹を得るために必要な正味の待機時間

**式**:
```
E[Cycle] = Σ (P(魚i) × cycleTime(魚i))  // 全魚種の加重平均サイクル時間
P(target) = ターゲットのヒット率

expectedTime = (E[Cycle] - (P(target) × hookTime(target))) / P(target)
```

**直感的説明**:
- `E[Cycle] / P(target)` = 平均何回釣りをすればターゲットが1匹釣れるかの総時間
- `P(target) × hookTime(target)` = その中でターゲットを釣り上げる動作時間
- この差分 = 純粋な「待ち時間」

**計算例**:
```
E[Cycle] = 15.2s
P(target) = 35.7%
hookTime(target) = 5s

expectedTime = (15.2 - (0.357 × 5)) / 0.357
             = (15.2 - 1.785) / 0.357
             = 13.415 / 0.357
             = 37.6s
```

### 6. 戦略全体の期待値 (加重平均)

**目的**: 複数のシナリオを含む戦略全体の性能評価

**アルゴリズム**:
```javascript
weightedHitRate = 0;
weightedCycle = 0;
totalProb = 0;

for (各シナリオ s in eligible_scenarios) {
    stats = calculateScenarioStats(s);
    pScenario = stats.scenarioProb;
    
    weightedHitRate += pScenario × stats.targetHitRate;
    weightedCycle += pScenario × stats.avgCycleTime;
    totalProb += pScenario;
}

// 戦略全体の期待値
avgHitRate = weightedHitRate;
avgCycle = weightedCycle;

expectedTime = (avgCycle - (avgHitRate × targetHookTime)) / avgHitRate;
```

---

## UI設計

### 状態管理

**グローバル変数**:
```javascript
let masterDB = null;           // JSONマスターデータ
let probabilityMap = null;     // 高速検索用Map
let currentMode = 'manual';    // 'manual' | 'strategy'
```

**状態遷移**:
```
[OFFLINE]
   ↓ (JSON読み込み)
[ONLINE]
   ├─ [Manual Mode]
   │   ├─ 設定変更 → 即時再計算
   │   └─ 結果表示 + 詳細ビュー
   └─ [Strategy Mode]
       ├─ Set A/B 設定変更 → 即時再計算
       └─ 比較カード表示 + 詳細テーブル
```

### イベント駆動設計

**主要イベントハンドラー**:
```javascript
// ファイルアップロード
#jsonUpload.change → handleFileUpload()

// モード切替
.tab-btn.click → currentMode切替 + updateSimulation()

// 設定変更
#currentSpot.change → updateSpotDependents() → updateSimulation()
#lureType.change → updateLureUI() + updateSimulation()
.step-select.change → updateSimulation()

// リサイザー
.resizer.mousedown → mousemove監視開始
document.mousemove → パネル幅変更
document.mouseup → mousemove監視終了
```

### レンダリング戦略

**パフォーマンス重視の実装**:
1. **innerHTML一括更新**: 複数DOM操作を文字列結合で一括化
2. **DocumentFragment未使用**: テーブル行が少ないためinnerHTMLで十分
3. **条件分岐でのHTML生成**: エラー時とデータ表示時で異なる構造

**例** (結果テーブル):
```javascript
function renderResultTable(stats, targetName, ...) {
    const tbody = document.getElementById('res-table-body');
    tbody.innerHTML = '';  // 一括クリア
    
    stats.forEach(s => {
        const tr = document.createElement('tr');
        if (s.name === targetName) tr.classList.add('row-target');
        tr.innerHTML = `<td>${s.name}</td>...`;
        tbody.appendChild(tr);  // 個別追加 (数が少ないため許容)
    });
}
```

### レスポンシブ対応

**パネル幅調整**:
- デフォルト幅: Left 360px / Right 420px
- リサイズ範囲: Left 300-600px / Right 320-600px
- 中央パネル: Flex-grow (残り全て) + max-width 720px で中央寄せ

**折りたたみ機能**:
- 右パネルのみ折りたたみ可能 → 50px (縦書きタイトルのみ)
- CSS transition 0.3s でスムーズなアニメーション

---

## エラー処理設計

### エラー検出ポイント

1. **JSON読み込み時**:
   ```javascript
   try {
       masterDB = JSON.parse(e.target.result);
       if (!masterDB.probabilities) throw new Error("Missing probabilities");
   } catch (err) {
       alert(`データ読み込み中にエラーが発生しました:\n${err.message}`);
   }
   ```

2. **確率データ検索時**:
   ```javascript
   const probData = probabilityMap.get(searchKey);
   if (!probData &&