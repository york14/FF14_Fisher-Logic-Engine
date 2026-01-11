以下、アップロードいただいた4点（HTML/JS/CSS/JSON）を前提に、**致命的な点（想定外エラー・仕様不一致）**と、**修正推奨（一般化・効率）**に分けてレビューします。    

---

## 1. 致命的な点（予期せぬErrorの可能性 / 説明と異なる挙動）

### 1) 「ルアー未使用」時に、確率テーブル（probabilities）を拾ってしまう可能性

`calculateScenarioStats()` の `probData` 探索条件が、**lureType='none' のとき lure_type 条件を無視**しています。 

```js
(constraint) (config.lureType === 'none' || row.lure_type === config.lureType)
```

この結果、**「ルアー無し」戦略（no_lure）でも、アンビシャス等の確率レコードを偶然拾う**可能性があります。

現状の副作用：

* no_lure の `scenarioId` は `none_0` なのでシナリオ確率計算はスキップされますが、`hiddenFishName` などが `probData` から引かれうるため、**隠し魚の扱い（weight から除外する処理）が“ルアー無しでも発動する”**構造になっています。 
* JSON側では隠し魚の weight が 0 のケースが多く、表面化しにくいですが（例：ゴールデングルーパーの weight 0）、データが増えたときに仕様不一致として顕在化します。 

**推奨（致命対応）**：`lureType === 'none'` の場合は `probData` を参照しない（`probData=null`、`hiddenFishName=null`、`pHidden=0` を強制）など、分岐を明確化してください。

---

### 2) 戦略プリセットの自動選択が「配列の2番目固定」で落ちる

`updateStrategyPresetsFilter()` で、ルアー有り時に `masterDB.strategy_presets[1].id` をデフォルトにしています。 

```js
presetSel.value = (lureVal === 'none') ? 'no_lure' : masterDB.strategy_presets[1].id;
```

`strategy_presets` が「no_lure しかない」「並びが変わる」「1件しか無い」場合に **TypeError** になります。

**推奨（致命対応）**：

* `strategy_presets.find(p => p.id !== 'no_lure')` のように安全に選ぶ
* もしくは `presetSel.options` の最初の「disabledではない option」を選ぶ

---

### 3) JSONを複数回ロードするとイベントリスナーが増殖する（動作が重くなる/二重実行）

`populateSelectors()` 内で `currentSpot` に `change` リスナーを追加しています。 

```js
spotSelect.addEventListener('change', updateSpotDependents);
```

一方、初期化時にも `commonInputs` で `currentSpot` に `change` → `updateSimulation` を登録しています。 
加えて、JSONをロードし直すたびに `populateSelectors()` が呼ばれるため、**updateSpotDependents のリスナーが積み増し**されます。

症状：

* Spot変更1回で `updateSpotDependents` が複数回走り、最終的に `updateSimulation()` が多重呼び出し
* “たまに重い/挙動が変” の原因になりやすい

**推奨（致命対応）**：リスナー登録は初期化時に1回だけにする（`populateSelectors()` は option 再構築のみ）。もしくは `replaceWith` などで要素自体を差し替えてリスナーをリセット。

---

### 4) 画面上のバージョン表記が不整合（説明と異なる印象を与える）

* HTMLは “FLE Simulator v2.0” / 見出し v2.0 
* JSコメントは “FLE v2.1” 
* CSSコメントは v2.3 
* JSONは version 2.0.0 

致命的なクラッシュではありませんが、レビュー観点の「明らかに説明と異なる機能」に該当しやすいので、最低限 **UI表示のバージョンは masterDB.version に統一**するのが安全です（ロード後に見出し側も更新）。

---

### 5) XSS（JSONが信頼できない場合は致命）

`innerHTML` に、JSON由来の文字列（魚名/プリセット名/説明等）が混ざっています。 
例：戦略カードの `res.name`, `res.description`、テーブルの魚名など。

* ローカルで自分のJSONだけ使う前提なら実害は薄いですが、
* 外部共有/配布/他人のJSONを読み込む想定があるなら、**悪意ある文字列でスクリプト注入**が成立します。

**推奨（致命対応）**：表示の多くを `textContent` / `createElement` に寄せる、もしくはサニタイズ関数を挟む。

---

## 2. 修正が推奨される点（一般化・非効率の解消）

### A) 計算部のデータアクセスが O(n^2) になっている（魚数が増えると効く）

`fishList.forEach` の中で `baseWeights.find(...)`、`weightDetails.find(...)` を都度行っています。 
魚が数十〜数百に増えると、UI操作のたびに体感が落ちます。

**推奨**：

* `baseWeights` を `Map(fishName -> weightRow)` に
* `weightDetails` も `Map(name -> detail)` に
* これで `find` を排除できます

---

### B) “発見は1回まで” がUIレベルで防止されていない（今は実行時エラー表示のみ）

現在は `runManualMode()` 内で `discCount > 1` を検知して警告し、結果表示を止めています。 
ただ、UI操作で普通に2回“発見”を選べてしまうので、ユーザー体験としては「なぜ赤字が出たか分かりにくい」状態になりやすいです。

**推奨**：

* `updateLureUI()` または別関数で、どこかのStepが disc になった時に、他Stepの disc option を disable する
* あるいは disc を選んだ時に他の disc を none に戻す

---

### C) “ルアー拘束時間(lureTime)” と “サイクル時間” の定義が設定依存で読みにくい

`lureTime = D_CAST + n*D_LURE + D_BLK` で、さらに `cycleTime = D_CAST + waitTime + hook + (chum ? D_CHUM : 0)` となっています。 
この設計自体は成立していますが、「キャスト時間 D_CAST」が複数箇所に出てくるため、将来的に調整したとき齟齬が出やすいです。

**推奨**：

* `castPhaseTime` / `actionPhaseTime` / `postHookPhaseTime` のように分解して、重複を避ける
* debug 表示もその分解に合わせると、仕様説明が安定します

---

### D) assets パスと配置の整合性

HTMLは `assets/style.css` と `assets/main.js` を参照します。 
今回アップロードは `/mnt/data/style.css`, `/mnt/data/main.js` なので、実運用のディレクトリ構成次第では **起動直後にCSS/JSが読み込まれない**可能性があります（これは配布形態によります）。

**推奨**：

* 実際の配置が `/assets/` ならOK
* そうでないなら参照パスを合わせる（またはビルド/配置手順をREADMEに固定）

---

## 3. 優先度付きの対応提案（最短で安全にする順）

1. **lureType='none' の確率テーブル参照を明示的に禁止**（仕様不一致の芽を摘む） 
2. **strategy_presets[1] 固定の撤廃**（データ差し替えで落ちる） 
3. **JSON再ロード時のイベントリスナー増殖を防止**（多重実行・体感劣化） 
4. （配布想定なら）**innerHTML を抑制してXSS耐性** 
5. パフォーマンス改善（Map化） 

---

必要であれば、上記の「1)〜3)」を中心に、**差分パッチ（具体的にどの関数をどう直すか）**として提案できます。今回の構造は全体として整理されており、UI/計算/デバッグの分離も概ねできているため、上記の“落ちる・仕様が揺れる”部分を先に塞ぐのが最も費用対効果が高いです。
