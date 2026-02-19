# 最適化タブ（総合戦略評価）開発メモ

## 概要
2つの戦略セット（GP赤字のセットA、GP黒字のセットB）を組み合わせ、制限時間内で初期GP+回復分をちょうど使い切る「最適配分」を算出する機能。

## 数学モデル
連立方程式（Cramerの公式）を使用：

```math
\begin{cases}
n_A \cdot C_A + n_B \cdot C_B = T \\
n_A \cdot G_A + n_B \cdot G_B = -G_{total}
\end{cases}
```
- $n_A, n_B$: 各セットの使用回数（未知数）
- $C_A, C_B$: Avg Cycle Time (秒)
- $G_A, G_B$: Net GP Influence per Cycle (GP収支)
- $T$: Time Window (秒)
- $G_{total}$: Initial GP + Saljak Bonus

## 実装のポイント
- **Strategy Set**: UIでは「プリセット」「トレード」「撒き餌」「ルアータイプ」を指定。
- **Lure Type**: `calculateScenarioStats` は正しい `lureType` を受け取らないと、全シナリオ分岐を単純加算（確率1.0扱い）してしまい、サイクル時間が異常値になる。UIにルアータイプ選択を追加して解決。
- **計算**: `tab_optimizer.js` 内で `solveLinearSystem` を実装。
- **表示**: 結果が見やすいよう、小数点表示を制御 (`toFixed(1)` 等)。

## 既知の課題
- **シェア機能未対応**: 現在のURLパラメータ保存・復元ロジック（`main.js`）は、最適化タブの設定（`optALure` 等）に対応していないため、ページをリロードすると設定が消える。
- **変数モード未対応**: 現在は固定確率モードのみ。確率変動を取り入れるにはボタン実行式での再計算が必要。

## ファイル構成
- `src/ui/tab_optimizer.js`: 最適化タブのUI制御・計算・レンダリング
- `index.html`: 最適化タブのHTML構造
