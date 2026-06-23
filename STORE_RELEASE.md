# iOS App Store 公開 手順書（社労士試験 横断アプリ）

買い切りの**アプリ内課金（無料3テーマ → 全テーマ解放）**を入れたため、ラッパーは **Capacitor** を使う（素のPWABuilder/WebView単体ではIAPが扱えないため）。Mac/Xcode は準備済み・Apple Developer は未登録の前提。

> 課金のWeb側は実装済み：`app.js` が `window.SharoBilling.purchase()/restore()` を呼び、購入/復元の確認で `window.sharoUnlock()` が走って全テーマ解放。ネイティブ側の橋渡しは `js/billing.js`（cordova-plugin-purchaseがある時だけ作動、Web版では無害）。

---

## 0. 全体像（審査込みで1〜2週間）
1. Apple Developer Program 登録（$99/年）… **本人作業**
2. Capacitorプロジェクト作成 → このWebアプリを中に入れる（オフライン同梱）
3. IAPプラグイン導入 → App Store ConnectでIAP商品（非消費型）を作成
4. Xcodeで署名・ビルド・アップロード
5. App Store Connectで掲載情報・スクショ・審査提出

---

## 1. Apple Developer Program 登録（本人・必須）
- https://developer.apple.com/jp/programs/ →「登録」。年額 11,800円。承認まで数時間〜2日。
- まずは **個人(Individual)** で可（販売者名に本名が出る点に留意）。

## 2. Capacitorプロジェクト作成（このWebを同梱）
ターミナル（Mac・Node必須）で、sharo-master とは別の作業フォルダに：
```bash
# 作業フォルダ作成
mkdir sharo-ios && cd sharo-ios
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/ios
npx cap init "社労士試験 横断アプリ" "jp.ed.butterfly.yokudan" --web-dir=www

# Webアプリ一式を www/ に入れる（このリポの中身をコピー）
mkdir www
cp -R ~/Downloads/sharo-master/* www/
# 不要物は消してよい（任意）: rm -rf www/.git www/*.md www/icon_backup_*

npx cap add ios
npx cap sync ios
```
- `--web-dir=www` に**このリポの静的ファイルをそのまま同梱**＝オフラインで完全動作（審査4.2対策にも有効）。
- アプリ名 / Bundle ID（例 `jp.ed.butterfly.yokudan`）は控えておく。

## 3. アプリ内課金（IAP）プラグイン導入
```bash
npm i cordova-plugin-purchase
npx cap sync ios
```
- これで WebView 内に `CdvPurchase` が注入され、同梱済みの `js/billing.js` が自動で `window.SharoBilling` を有効化する（商品ID = `pro_all_unlock`）。
- StoreKit用に Xcode で **In-App Purchase capability** を追加（§5）。

## 4. App Store Connect：アプリ枠＋IAP商品を作成
https://appstoreconnect.apple.com/ → マイApp → ＋ → 新規App
- プラットフォーム: iOS／名前: **社労士試験 横断アプリ**／言語: 日本語／バンドルID: §2の値／SKU: 任意

### IAP（アプリ内課金）商品
- 「App内課金」→ ＋ → **非消費型（Non-Consumable）**
- **プロダクトID: `pro_all_unlock`**（`js/billing.js` と一致・厳守）
- 参照名: 全テーマ解放／表示名（日本語）: 全テーマを解放／説明: 全274テーマ・約2,500問が使い放題
- **価格: 推奨 ¥980（買い切り）**（競合の書籍¥1,760より安く・一度の購入でずっと利用可。¥600〜¥1,200で調整可）
- 審査用のスクショ（課金画面）を1枚添付（使い方ページの「全テーマを解放」or ロックテーマのペイウォール画面）

## 5. Xcodeで署名・ビルド
```bash
npx cap open ios   # Xcodeが開く
```
- Signing & Capabilities → Team に自分のApple Developerを設定（自動署名）／Bundle Id を §2 に。
- ＋ Capability → **In-App Purchase** を追加。
- アイコン：`Assets.xcassets > AppIcon` に **1024px・アルファ無し**の `icons/appstore-1024.png`（リポジトリ同梱・透過チャネル除去済。App Store Connectはアルファ付きアイコンを弾く）を入れる。元デザインは `~/Downloads/アプリアイコン.png`。
- シミュレータ/実機で動作確認：①機内モードでも起動・○×が出る ②ロックテーマでペイウォール ③Sandboxアカウントで購入→解放→「購入を復元」も動く（Sandboxは App Store Connect > ユーザーとアクセス > Sandbox で作成）。
- Product → Archive → Distribute App → App Store Connect → Upload。

## 6. 掲載情報（コピーはそのまま使えます）
- カテゴリ: **教育**／年齢制限: **4+**／価格（アプリ本体）: **無料**（課金は上記IAP）
- プライバシーポリシーURL: `https://makotoikeda1977.github.io/sharo-master/privacy.html`
- サポートURL: `https://makotoikeda1977.github.io/sharo-master/`
- App プライバシー: **データを収集していません**（広告/解析/トラッキング無し・端末内localStorageのみ）

**App名（30字以内）**
```
社労士試験 横断アプリ
```
**サブタイトル（30字以内）**
```
過去問で横断攻略・苦手を弱点補強
```
**プロモーションテキスト（170字以内・随時変更可）**
```
社労士試験の「似ているけど違う」を横断テーマで整理。274テーマ・約2,500問の過去問○×を、現行法（令和7年度）で全問チェック済み。間違えた問題は「弱点補強」に自動で集約。まず3テーマを無料でお試しできます。
```
**説明文**
```
社労士試験は「似ているのに少し違う」論点の宝庫です。本アプリは、健保・厚年・国年・労基・労災・雇用・徴収・労一・社一を横断テーマで整理し、過去問の○×でアクティブリコール（思い出す練習）を回して定着させる学習アプリです。

■ 特長
・横断274テーマ：資格の得喪／保険料の徴収／標準報酬／遺族の範囲／障害の要件 など、科目をまたいで比較表で整理
・過去問○× 約2,500問：実際の本試験の肢を多数収録。各テーマで一問一答
・現行法で全問チェック済み：令和7年度の法令・条文に照らして正誤を検証（改正点も反映）
・弱点補強：間違えた問題だけが自動で集まり、重点的に復習できる
・赤シート＆比較表：覚えるべき答えを赤シートで隠し、タップで1つずつ確認。差分が一目で分かる横断比較表で、まず思い出してから答え合わせ
・オフライン対応：一度開けば電波がなくてもサクサク
・まず無料でお試し：3テーマは無料。全テーマは一度の購入（買い切り）で解放、追加料金なし

■ こんな方に
・科目別の勉強は終わったが、横断の整理で点を伸ばしたい
・通勤・休憩のスキマ時間に過去問を回したい

※学習補助を目的としたものであり、合格を保証するものではありません。
```
**キーワード（100字・カンマ区切り）**
```
社労士,社会保険労務士,社労士試験,横断,過去問,一問一答,労働基準法,健康保険,厚生年金,国民年金,労災,雇用保険,徴収法,資格,暗記,赤シート
```

## 7. ⚠️ 審査リスク（4.2「最低限の機能」）
WebをラップするアプリはAppleに「ただのサイト」と見なされるとリジェクトされる。本アプリの反論材料：
- **オフラインで完全動作**（Webを同梱・Service Workerでキャッシュ。機内モードで実演可）
- 274テーマ・約2,500問の独自DBと学習機能（○×採点・弱点補強・忘却曲線）＝閲覧サイトではない
- IAPあり＝ネイティブ機能を使用

それでもリジェクトされたら：**ローカル通知で「今日の復習リマインド」を追加**（`npm i @capacitor/local-notifications`）。“ネイティブならでは”の機能が1つ加わり4.2を満たしやすい。

## 8. スクリーンショット
- 必須：**6.7インチ（1290×2796）** 最低1枚。`screenshots/home.png` を用意済み。
- 推奨＝iOS Simulatorで `⌘S`：①ホーム ②比較表(赤シート) ③○×問題 ④弱点補強 ⑤ペイウォール（課金IAPの審査用にも使える）。

## 9. 公開後の更新
- **Web同梱方式なので、問題の追加・修正はアプリの再ビルド・再申請が必要**（content.jsを更新→§2のcp→cap sync→Archive）。
- 「審査なしで即反映したい」場合は将来、`capacitor.config` の `server.url` でGitHub Pagesを読む“ハイブリッド”に切替も可（ただしオフライン性と4.2耐性は同梱方式が有利）。

---
### チェックリスト
- [ ] Apple Developer 登録（本人・$99/年）
- [ ] Capacitorプロジェクト作成・www/ に Webを同梱・`npx cap add ios`
- [ ] `cordova-plugin-purchase` 導入・`cap sync`
- [ ] App Store Connectでアプリ作成＋**IAP非消費型 `pro_all_unlock`（¥980）**
- [ ] Xcode：In-App Purchase capability・署名・1024pxアイコン
- [ ] Sandboxで購入→解放→復元を確認
- [ ] Archive→Upload／掲載コピー（§6）・スクショ・プライバシー
- [ ] 審査提出 → 4.2でNGならローカル通知を追加して再申請
