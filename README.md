# Fisher Logic Engine (FLE)

Fisher Logic Engine (FLE) は、FF14における釣獲確率や戦略のシミュレーションを行うためのWebアプリケーションです。
v3.0以降にて、Viteベースの Vanilla JS モジュール構成へとリファクタリングされ、フロントエンド完結で動作するよう設計されています。

## プロジェクト構成

```text
pj_FF14_Fisher-Logic-Engine/
├── foundation/      # プロジェクト固有のルール・各種仕様書（正本）
├── src/             # シミュレータのソースコード (Vanilla JS + CSS)
│   ├── core/        # 計算ロジック・シナリオ構築
│   ├── data/        # マスタデータ (logic_master.json)
│   └── ui/          # UI制御・レンダリング
├── index.html       # アプリケーションのエントリポイント
├── share.html       # 共有URL用の簡易ビューア
├── archive/         # 旧バージョンのファイルや過去のドキュメント
└── README.md        # 本ドキュメント
```

## 開発・実行方法

本プロジェクトは Node.js および Vite を使用しています。

```bash
# パッケージのインストール
npm install

# 開発用ローカルサーバーの起動
npm run dev

# プロダクションビルドの作成（必要に応じて）
npm run build
```

## ドキュメントについて

本プロジェクトの仕様書や設定ルールは、すべて `foundation/` ディレクトリ配下に格納されています。機能の追加や改修を行う際は、必ず以下のドキュメントを確認してください。

👉 **[foundation/README.md](foundation/README.md)** : 各種仕様書（システム仕様、ゲーム仕様、データ仕様）へのインデックス

## 基本ルール

このプロジェクトは、ワークスペースの標準ルールに従います。
- **[ワークスペース標準ルール](../../GEMINI.md)** を必ず参照すること。
- **[ワークスペース詳細ルール](../../Antigravity/foundation/rules_and_mechanics.md)** （Windowsターミナル実行、トラブルシューティング等）

---
*最終更新日: 2026-03-10*
