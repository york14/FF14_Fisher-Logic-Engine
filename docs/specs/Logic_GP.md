# 論理仕様書: GP管理

本書は、GP (Gathering Points) の管理、コスト計算、および持続可能性 (Sustainability) の判定ロジックを詳述する。
実装: `src/core/optimizer.js`

## 1. GP定数とコスト

### 1.1 基本定数
*   **Max GP (最大GP)**: `1000` (持続可能性計算の基準値)
*   **Recovery Rate (回復速度)**: `7.0` GP / Tick
*   **Tick Interval (回復間隔)**: `3.0` 秒 (エオルゼア時間ティック)

$$ R_{GP/sec} = \frac{7.0}{3.0} \approx 2.333\dots $$

### 1.2 スキルコスト ($C_{Skill}$)
各漁師スキルの固定GPコスト。

| スキル名 | コスト | 実装キー |
| :--- | :--- | :--- |
| **撒き餌** (Chum) | **145** | `CHUM` |
| **トレードリリース** (Surface Slap) | **200** | `SURFACE_SLAP` |
| **セイムキャスト** (Identical Cast) | 350 | `IDENTICAL_CAST` (v3.0 UI未実装) |
| **ダブルフッキング** (Double Hook) | 400 | `DOUBLE_HOOK` (v3.0 UI未実装) |
| **トリプルフッキング** (Triple Hook) | 700 | `TRIPLE_HOOK` (v3.0 UI未実装) |
| **プライズキャッチ** (Prize Catch) | 200 | `PRIZE_CATCH` (v3.0 UI未実装) |

## 2. 計算ロジック

### 2.1 サイクルGPコスト ($C_{Cycle}$)
1回のキャスティングサイクルで消費されるGPの総和。

$$ C_{Cycle} = \sum C_{Skill} $$

*   **トレードリリース** 有効時: +200
*   **撒き餌** 有効時: +145
*   **合計**: 最大 345 (現在の通常モードの範囲内)

### 2.2 GP収支バランス ($B_{GP}$)
サイクル時間に基づいて、1サイクルあたりのGP増減を計算する。

1.  **回復GP ($GP_{Rec}$)**:
    $$ GP_{Rec} = T_{Cycle} \times R_{GP/sec} $$
    *   $T_{Cycle}$: コアロジックで算出された平均サイクル時間。

2.  **バランス**:
    $$ B_{GP} = GP_{Rec} - C_{Cycle} $$

### 2.3 持続可能性指標 (Sustainability Metrics)

*   **Sustainable (持続可能)**: $B_{GP} \ge -0.1$ (浮動小数点誤差許容)
    *   意味: キャスト/待機/フッキングの間に回復するGPが、消費GPを上回っている。無限にループ可能。

*   **Unsustainable (枯渇/Depletion)**:
    *   $B_{GP} < 0$ の場合。毎サイクルGPが減少していく。
    *   **枯渇までのキャスト数 ($N_{Deplete}$)**:
        $$ N_{Deplete} = \frac{\text{Max GP}}{|B_{GP}|} $$
    *   意味: Max GPから開始して、GPが0になるまでに何回キャスト可能か。

## 3. 統合

*   GP計算は、時間シミュレーション (`calculateScenarioStats` / `calculateStrategySet`) の**後**に実行される。
*   結果は `stats.gpStats: { cost, balance }` として計算結果オブジェクトに付与される。
