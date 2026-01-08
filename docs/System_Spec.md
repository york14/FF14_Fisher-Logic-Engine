# Fisherman Logic Engine (FLE) - System & Tool Spec v1.0

# Fisherman Logic Engine (FLE) - System Spec v1.1

## 第1章：マスターコンバータ (FLE Master Converter)

### 1.1 目的
マスタデータ（CSV）をシステム用データ（JSON）へ変換し、データの完全性を保証する。

### 1.2 技術スタック
- **Language**: HTML5 / JavaScript (ES6+)
- **Library**: [PapaParse](https://www.papaparse.com/) (CSV Parser)
- **API**: [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (ファイル保存/読み込み)

### 1.3 変換ロジック詳細
1. **正規化 (Normalization)**:
   - 確率値: `23.11%` → `0.2311` (Float)
   - 型表記: `小型` → `small_jaws`, `大型` → `large_jaws`
   - 演出記号: `！` → `!` (半角統一)
   - フラグ: `0/1` → `false/true`
2. **バリデーション**:
   - `probabilities` テーブルの各行に対し、`fish_master` に存在しない魚種が指定されていないか確認。
   - 必須カラム（9種の隠しヒット率など）の欠損チェック。
3. **キー生成**:
   - 検索用キー `Spot|Weather|Bait` および `Spot|Weather|Bait|Hidden|Slap|Lure` を生成し、ハッシュマップ構造を構築。

### 1.4 出力仕様
- **ファイル名**: `fle_master_db.json`
- **保存方法**: 
  - ブラウザの「名前を付けて保存」ダイアログを表示。
  - ユーザーがディレクトリおよびファイル名を選択。
```

---

## 第2章：入力パラメータと状態定義 (User Inputs & States)

### 2.1 環境設定 (Environment Selection)

ユーザーがUIで最初に決定する項目。

* **釣り場 (Fishing Spot)**: `マスタ - 釣り場定義.csv` から取得。
* **天気/時間 (Weather/Time)**: 選択した釣り場に紐づく項目を動的に表示。
* **餌 (Bait)**: 選択した釣り場に紐づく項目を動的に表示。

### 2.2 スキル・アクション設定 (Skill & Action States)

計算結果に影響を与える動的変数。

* **撒き餌 (Chum)**: ON/OFF (ONの場合、全魚種の待機時間  を0.6倍にする)。
* **トレードリリース (Surface Slap)**:
* 現在の釣り場の出現リストのうち、「トレード可否」が `1` の魚種のみを選択肢に表示。
* 選択された魚種の基礎重みを物理的に `0` として扱う。


* **ルアー種類 (Lure Type)**: 「アンビシャスルアー (Large)」または「モデストルアー (Small)」。
* 隠し魚の型と不一致の場合、発見判定そのものをスキップする。



### 2.3 計算対象の決定 (Target Action Count)

* **アクション停止回数 (n)**: ルアーを何回振った際の結果を表示するか (0〜3回)。
* 0回（通常キャスト）、1回目、2回目、3回目のそれぞれの期待値を一覧表示する。



---

## 第3章：ロジックエンジン (FLE Core Logic)

### 3.1 確率計算シーケンス

1. **マトリクス生成**: GDSに基づき、ルアー回数  に応じた発生パターン（最大32種）を生成。
2. **パターン確率算出**: CSVの独立確率（発見、未発見型確定、発見済型確定）の積を算出。
3. **魚種抽選シミュレーション**:
* **隠し魚判定**: パターンごとに定義された `hidden_hit_rate` に基づき、隠し魚が釣れる確率を算出。
* **通常魚判定**: 隠し魚が釣れなかった残りの確率を、トレード適用後の「基礎重み比」で分配。


4. **期待値集計**: 全魚種の「釣れる確率」「実効待機時間」「演出硬直」を合算し、時間効率を算出する。