# 簿記仕訳トレーニング

簿記の仕訳を練習できる静的サイトです。仕訳問題に対して勘定科目と金額をクリック(またはドラッグ&ドロップ)で選択し、解答して答え合わせを行います。

## 特徴

- 白ベースのシンプルなUI
- 借方・貸方を色分けして直感的に把握
- 日商簿記3級・2級 × 初級/中級/上級で問題を絞り込み
- 問題は `data/problems.csv` で管理、自由に追加・編集可能

## ローカルで動かす

CSVを `fetch` で読み込むため、`file://` で直接開くと動作しません。簡易サーバーを立てて開いてください。

```bash
npx http-server . -p 8765
# http://localhost:8765 を開く
```

## 問題の追加方法

`data/problems.csv` に1行追加します。列の意味は以下の通りです。

| 列名 | 説明 |
|---|---|
| id | 問題ID(一意) |
| level | 受験級(例: 3級, 2級) |
| difficulty | 難易度(初級/中級/上級) |
| question | 問題文 |
| debit_accounts | 借方の勘定科目。複数行は `;` 区切り |
| debit_amounts | 借方の金額。`debit_accounts` と同じ順・同じ数 |
| credit_accounts | 貸方の勘定科目。複数行は `;` 区切り |
| credit_amounts | 貸方の金額。`credit_accounts` と同じ順・同じ数 |
| account_pool | 選択肢に出す勘定科目一覧。`\|` 区切り(正解の科目を必ず含める) |
| explanation | 解説文 |

`data/problems.csv` の変更は GitHub Actions で自動検証されます(列数不整合や `account_pool` に正解科目が含まれているか等)。

## デプロイ

`main` ブランチへの push で GitHub Pages に自動デプロイされます。
