# タスク一覧 (Tasks)

## 進行中のフェーズ: Vercel移行 & 基盤整備

- [x] **プロジェクト分析とセットアップ**
    - [x] 既存ファイルの分析 (index.html, main.js, logic_master.json, specs)
    - [x] Vercel移行の実装計画作成
    - [x] プロジェクト標準文書の整備 (`_foundation_` フォルダ)

- [ ] **実装フェーズ**
    - [ ] Vercel対応プロジェクト構造の初期化 (Vite)
        - [ ] `npm create vite@latest` の実行
        - [ ] `vite.config.js` の設定
    - [ ] main.js と index.html のロジック移植
        - [ ] ロジックを `src/main.js` へ移動しモジュール化
        - [ ] CSSを `src/style.css` へ移動
        - [ ] ルートディレクトリに `index.html` を配置
    - [ ] JSON自動読み込みの実装
        - [ ] `logic_master.json` を直接インポートするよう変更
        - [ ] 手動アップロードUIの削除

- [ ] **検証フェーズ**
    - [ ] ローカルテスト (`npm run dev`)
        - [ ] 自動読み込み機能の確認
        - [ ] 計算ロジックの整合性確認
    - [ ] ビルド検証 (`npm run build`)

## 将来の予定
- [ ] Vercelへのデプロイ
- [ ] GP最適化 (ロードマップ ステップ3)
