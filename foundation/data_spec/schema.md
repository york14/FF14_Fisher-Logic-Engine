# Data Schema

本プロジェクトにおけるシミュレーション基盤となる `logic_master.json` の構造定義です。

## ルーティング・基本プロパティ
- `version`: JSONフォーマットのバージョン
- `updated_at`: 最終生成日時

## 1. fish (魚マスタ)
対象となる魚の基本パラメータ。
- `type`: `large_jaws` または `small_jaws`（ルアー判定用）
- `vibration`: 振動タイプ (`!`, `!!`, `!!!`)
- `hook_time`: 釣り上げにかかる時間（秒）
- `is_hidden`: 隠し魚（各種条件で確率出現する特殊な魚）かどうか
- `can_slap`: トレードリリースの対象にできるか

## 2. spots (釣り場マスタ)
各釣り場の構成情報。
- `expansion`: 実装された拡張パッケージ（例: `黄金の遺産_7.x`）
- `area`: 地域名
- `weathers`: 釣り場に設定されている天候リスト
- `baits`: 釣り場に設定されている餌リスト
- `fish_list`: その釣り場・天候・餌の組み合わせで釣れる可能性のある魚名のリスト

## 3. weights (基本重みデータ)
キーフォーマットは `${spot}|${weather}|${bait}`。
指定条件下での各魚の基本重みとヒット可能時間帯（秒）を定義する配列。
- `fish`: 魚の名前
- `weight`: 基本重み。これをベースにルアーなどによる乗算補正（$M$）がかかる
- `bite_time_min`: ヒットし始める最小時間
- `bite_time_max`: ヒットしなくなる最大時間

## 4. probabilities (ルアーシナリオ確率データ)
特定のルアーに関するステップごとの詳細な確率モデルデータ。配列として格納。
- `spot`, `weather`, `bait`, `slap_target`, `lure_type` 等で一意に特定される
- `disc_rates`: 1〜3ステップ目での「発見」確率の配列
- `guar_rates_nodisc`: 発見前の「型確定」の基本確率配列
- `guar_rates_after_disc`: 発見後、特定のステップで「型確定」する確率（キー例: `d1_g2` = 1回目発見、2回目確定）
- `hidden_hit_rates`: 特定シナリオ到達時の、隠し魚（`target_hidden`）のヒット率定義