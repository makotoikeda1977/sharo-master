#!/usr/bin/env bash
# sharo-master を最新版に同期するスクリプト(このファイルをリポジトリ直下に置いて実行)
set -e
cd "$(cd "$(dirname "$0")" && pwd)"

REMOTE_URL="https://github.com/makotoikeda1977/namito-collector.git"
BRANCH="claude/pensive-wright-tFYoH"

echo "📥 最新を取得中..."
git remote remove sharo_src 2>/dev/null || true
git remote add sharo_src "$REMOTE_URL"
git fetch -q sharo_src "$BRANCH"

rm -rf .sharo_tmp && mkdir .sharo_tmp
git archive FETCH_HEAD dist-sharo | tar -x -C .sharo_tmp
cp -R .sharo_tmp/dist-sharo/. ./
rm -rf .sharo_tmp
git remote remove sharo_src 2>/dev/null || true

if git diff --quiet && git diff --cached --quiet; then
  echo "✅ すでに最新です(変更なし)"
  exit 0
fi

git add -A
git commit -q -m "アプリを最新版に同期"
echo "🚀 反映中..."
git push -q
echo "✅ 完了! アプリを ⌘+Shift+R(スマホは閉じて開き直し→再リロード)で更新してください"
