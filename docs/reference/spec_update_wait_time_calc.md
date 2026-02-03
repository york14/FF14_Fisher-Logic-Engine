# 計算ロジック変更仕様書: 待機時間平均値の算出精度向上

## 1. 概要
v3.2.0にて導入された「待機時間のMin-Max範囲（一様分布仮定）」と「ルアー拘束時間（固定値）」を比較する際、単純な最小・最大の比較だけでは平均値（期待値）が正確に算出できないケースがあることが判明したため、計算ロジックをより厳密な積分ベースの期待値計算に変更する。

## 2. 現状の課題 (Current Problem)

現状の計算式（v3.2.0時点）:
```javascript
waitTimeMin = Math.max(biteTimeMin, lureTime);
waitTimeMax = Math.max(biteTimeMax, lureTime);
waitTimeAvg = (waitTimeMin + waitTimeMax) / 2;
```

この式は、分布全体が単純にシフトする場合（$Lure < Min$ または $Lure > Max$）は正しいが、**分布の途中をルアー拘束時間が横切る場合（$Min < Lure < Max$）** に誤差が生じる。

### 具体例
*   **補正後待機時間 (Bite)**: $8.0$秒 ～ $16.0$秒 （範囲幅 $8.0$秒、一様分布と仮定）
*   **ルアー拘束時間 (Lure)**: $10.0$秒

**現状の計算結果:**
*   $WaitMin = \max(8, 10) = 10$
*   $WaitMax = \max(16, 10) = 16$
*   $Avg = (10 + 16) / 2 = \mathbf{13.0秒}$

**実際の挙動:**
待機時間が $8.0 \sim 10.0$秒の区間（確率 $0.25$）において、待機時間は一律で $10.0$秒（拘束）となる。
待機時間が $10.0 \sim 16.0$秒の区間（確率 $0.75$）においては、本来の待機時間が適用され、その平均は $13.0$秒である。

**正しい期待値:**
$$ E[W] = (10.0 \times 0.25) + (13.0 \times 0.75) = 2.5 + 9.75 = \mathbf{12.25秒} $$

**誤差:**
$+0.75$秒 のズレ（過大評価）が発生している。

## 3. 変更後のロジック (Proposed Logic)

待機時間 $X$ が $[Min, Max]$ の範囲で一様分布し、ルアー拘束時間を $L$ とするとき、実際の待機時間 $W = \max(X, L)$ の期待値 $E[W]$ を以下の通り算出する。

### ケース分けと計算式

#### ケース1: ルアー拘束が分布より短い ($L \le Min$)
ルアー拘束の影響を受けないため、従来通り単純平均となる。
$$ E[W] = \frac{Min + Max}{2} $$

#### ケース2: ルアー拘束が分布より長い ($L \ge Max$)
全てのケースでルアー拘束時間に引っかかるため、待機時間は $L$ となる。
$$ E[W] = L $$

#### ケース3: ルアー拘束が分布と交差する ($Min < L < Max$)
積分により期待値を求める。
$$ E[W] = \frac{1}{Max - Min} \left( L(L - Min) + \frac{Max^2 - L^2}{2} \right) $$

**（計算式の導出）**
範囲幅 $Range = Max - Min$ とすると、確率密度関数 $f(x) = \frac{1}{Range}$ である。
$$
\begin{aligned}
E[W] &= \int_{Min}^{Max} \max(x, L) f(x) dx \\
&= \frac{1}{Range} \left( \int_{Min}^{L} L dx + \int_{L}^{Max} x dx \right) \\
&= \frac{1}{Range} \left( [Lx]_{Min}^{L} + [\frac{x^2}{2}]_{L}^{Max} \right) \\
&= \frac{1}{Range} \left( L(L - Min) + \frac{Max^2 - L^2}{2} \right)
\end{aligned}
$$

### 実装イメージ (JavaScript)

```javascript
/* src/main.js */

// 入力: biteTimeMin, biteTimeMax, lureTime
let waitTimeAvg;

if (lureTime <= biteTimeMin) {
    // Case 1: Lure is short
    waitTimeAvg = (biteTimeMin + biteTimeMax) / 2;
} else if (lureTime >= biteTimeMax) {
    // Case 2: Lure is long
    waitTimeAvg = lureTime;
} else {
    // Case 3: Intersection
    // 範囲 [min, L] までは L, [L, max] まではその値
    const range = biteTimeMax - biteTimeMin;
    const term1 = lureTime * (lureTime - biteTimeMin); // 固定値部分の面積
    const term2 = (Math.pow(biteTimeMax, 2) - Math.pow(lureTime, 2)) / 2; // 線形増加部分の面積
    waitTimeAvg = (term1 + term2) / range;
}
```

## 4. 影響範囲
*   `src/main.js`: `calculateScenarioStats` (または `simulation`) 関数内の待機時間計算ロジック。
*   `renderStrategyComparison`: 表示ロジック自体に変更はないが、表示される `Expected Time` の値がより正確（短くなる方向）に変化する。
*   `renderResultTable`: 同上。

## 5. UIへの反映（重要）

### (1) 個別魚の待機時間（Result Table）
平均値が中心（(Min+Max)/2）からずれるため、従来の `平均 ± 偏差` という表示では実際の範囲と乖離し、ユーザーに誤解を与える（例：下限が実際より低く表示される）。
よって、**Min ～ Max の範囲表示** に変更する。

*   **変更前**: `13.0s ± 3.0s` (Avg ± Range)
*   **変更後**: `10.0 ～ 16.0s` (WaitMin ～ WaitMax)

### (2) 戦略全体の期待値（Strategy Card）
**はい、複合平均（期待待機時間）も新しい数式ベースになります。**
戦略全体の期待値は、各魚の待機時間平均（$E[W]$）を確率で加重平均して算出されるため、個別の計算精度向上はそのまま全体の精度向上に直結します。

*   表記: `24.5sec` <span style="color:#888">± 2.0sec</span>
    *   メインの数値: 新ロジックに基づく正確な期待値。
    *   ±Range: 従来の「（WaitMax - WaitMin）/ 2」の加重平均を"目安"として維持する。

