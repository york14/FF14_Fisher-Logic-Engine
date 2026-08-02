# 変数モードの隠し魚対応 & 基礎確率→実効確率（逆算）モデルへの刷新

## Objective
変数モード（基礎重み不明）において、以下の2つの問題を解決する。
1. 隠し魚（ゴールデングルーパー等）が存在する場合に、変数モードでヒット率が `0.0%` と表示されてしまうバグの修正。
2. スライダーで設定する `p` を「素の基礎確率」として扱い、トレードリリースやルアー補正の効果を反映した「実効確率 $p'$」を逆算表示する仕様への変更。

## Actions Taken

### 1. 隠し魚（pHidden）の変数モード計算式への組み込み
- `src/main.js`: `runManualModeVariable` および `runStrategyModeVariable` にて、隠し魚の固定確率 `pHidden` とそのサイクル時間 `C_hidden` を取得し、期待値の定数 $A', B'$ を以下のように再定義。
  - $A' = Ct - Hook - S$
  - $B' = p_h \times C_{hidden} + S \times (1 - p_h)$
  - $E[Time] = A' + B' / p'$
- `src/ui/render.js`: `renderVariableManualResult` および `renderVariableDebugDetails` のテーブル・数式表示・グラフ描画すべてに `pHidden` を反映。隠し魚は「固定確率」として専用の行で表示。

### 2. 基礎確率 p → 実効確率 p' への逆算モデル実装
- **逆算式**: ターゲットの基礎重み $W_t = K \times \frac{p}{1 - p_h - p}$（$K$ = 他魚の基礎重み合計）
- **実効確率**: $p' = \frac{W_t \times M}{W_{others\_final} + W_t \times M} \times (1 - p_h)$（$M$ = ルアー倍率、$W_{others\_final}$ = スラップ後の最終重み合計）
- `src/main.js`: `variableInfo` に $K$（基礎重み合計）を追加。戦略モードの `enrichedScenarios` にも `K`, `wOthers`, `M`, `S_i`, `Ct`, `p_h`, `C_hidden` を追加。
- `src/ui/render.js`: 手動モード・戦略モード両方に `getPActual(p)` 関数を実装し、グラフ描画・スライダー操作・数値表示すべてに適用。

### 3. UI表記の刷新
- 数式中の変数を `p` → `p'` に統一（テーブル・デバッグパネル・グラフ軸ラベル等）。
- 手動モードのパネルに「実効確率 (p')」と「基礎確率 (p)」を明確に分離表示。
- 「※ p' = 実効確率（基礎確率 p とスラップ状況から算出）」の注釈を追加。

### 4. 戦略モードNaNバグ修正
- `enrichedScenarios.push` に逆算に必要なフィールド（`K`, `wOthers`, `M`, `S_i`, `Ct`, `p_h`, `C_hidden`）が欠落していたため、`render.js` 側の参照が `undefined` → NaN伝播していた。フィールド追加で修正。

### 5. マスターCSV→JSON更新
- `npm run generate-master` を実行し、最新のマスターCSVから `logic_master.json` を再生成。

## Findings & ADR
- **逆算モデルの妥当性**: `calculator.js` でトレードリリースは `M=0`（倍率ゼロ化）で処理されており、`base`（基礎重み）は変化しない設計。このため、逆算の起点となる $K$（他魚の基礎重み合計）がスラップ状況に依存せず一定に保たれ、逆算式が数学的に正しく成立する。
- **スライダー上限と隠し魚**: 隠し魚 $p_h > 0$ の場合、基礎確率は理論上 $1 - p_h$ が上限。`getPActual` にクランプ処理を入れて安全に対処（スライダーUIの上限は100%のまま）。

## Next Steps
- [ ] 動作チェック（手動モード・戦略モードの両方で、隠し魚あり/なし × トレードリリースあり/なしの組み合わせを確認）
- [ ] 数値の妥当性検証（既知の基礎重みを持つ魚で通常モードと変数モードの結果が一致するか確認）

## Modified Files
- `src/main.js` — `runManualModeVariable`, `runStrategyModeVariable` の計算ロジック・データ構造
- `src/ui/render.js` — `renderVariableManualResult`, `renderVariableDebugDetails`, `renderVariableStrategyComparison` のUI・グラフ・数式表示
- `src/data/logic_master.json` — マスターCSVからの再生成
