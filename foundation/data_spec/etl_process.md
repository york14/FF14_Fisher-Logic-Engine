# Data Generation (ETL Process)

本プロジェクトにおけるシミュレーションマスタデータ（`logic_master.json`）の生成プロセスについての規定です。

## 概要
システムで利用されるJSONデータは、プロジェクト内の複数のCSVファイルから特定の変換スクリプトを介して生成されるビルドアーキテクチャを採用しています。これにより、プランナーやユーザーがスプレッドシート等でデータを管理しやすくなっています。

## ファイル構成
- **入力 (CSV)**: `src/data/csv/` ディレクトリ配下
  - `マスタ - 1_魚種.csv`
  - `マスタ - 2_拡張・エリア定義.csv`
  - `マスタ - 3_釣り場定義.csv`
  - `マスタ - 4_基礎重み・基礎待機時間.csv`
  - `マスタ - 5_発見・型確定・隠しヒット率.csv`
  - `マスタ - 6_ルアー戦略プリセット.csv`
- **変換ツール**: `scripts/generate-master.js`
- **出力 (JSON)**: `src/data/logic_master.json`

## 生成フロー
1. **マスタデータの編集**
   `src/data/csv/` 配下のCSVファイルを編集し、パラメータを追加・変更します。
2. **変換スクリプトの実行**
   プロジェクトルートにて以下のコマンドを実行します。
   ```bash
   npm run generate-master
   ```
   内部的に `node scripts/generate-master.js` が呼び出され、CSVがパース・結合されてJSONとして書き出されます。
3. **反映確認**
   開発サーバー（`npm run dev`）起動中であれば、`logic_master.json` の更新はHMR（Hot Module Replacement）によって自動的にブラウザへ反映されます。