# 社労士試験横断アプリ ストア提出チェックリスト

最終更新: 2026-06-18 / 作成: sharo-store チーム（ストア提出準備担当）
対象: 静的PWA「社労士試験横断アプリ」（GitHub Pages公開 / repo: makotoikeda1977/sharo-master / main）
公開URL想定: https://makotoikeda1977.github.io/sharo-master/

> このチェックリストは2026年6月時点でWeb照合した情報に基づきます。Apple/Googleの仕様は変わるため、提出直前に各公式ページを再確認してください（出所URLは末尾「参考リンク」）。

---

## 0. 大前提（必読）

本アプリは **HTML/CSS/vanilla JS の静的PWA** です。**PWAはそのままではApp Storeに出せません**。各ストアごとに「ラッパー（ネイティブの殻）」で包んでバイナリ化し、提出する必要があります。

- **Android（Google Play）= 比較的容易**。TWA（Trusted Web Activity）方式が公式サポート。中身は実質PWAそのままでよい。
- **iOS（App Store）= 難易度が高い**。WebViewにPWAを包んだだけだと **Apple審査ガイドライン 4.2（最低限の機能 / 単なるWebサイトのラップは却下）** でリジェクトされやすい。**ここが本件最大の関門**。

### 推奨方針（このアプリでの結論）

| ストア | 推奨ラッパー | 理由 |
|---|---|---|
| **Google Play** | **PWABuilder（TWA / 内部でBubblewrap）** | 公式サポート・要件明確・実質PWAそのまま通る。最短。 |
| **App Store** | **まずPWABuilder(WKWebView)で挑戦 → リジェクトされたらCapacitorへ移行** | PWABuilderのiOS出力は最短だがGuideline 4.2リジェクトのリスク大。Capacitorはネイティブ機能を足しやすく審査に強い。 |

> **現実的な順序の提案**: ①先にGoogle Playを出す（成功体験＆要件が緩い）。②並行してApp Storeに挑戦。iOSがリジェクトされたら、却下理由を見てネイティブ機能（後述）を足す or Capacitorに乗り換える。
>
> **注意**: 本アプリは「比較表＋一問一答」という学習ツールであり、Webサイトをただ包んだだけに見えやすい。**iOSは一発合格を期待せず、リジェクト→改善の往復を前提に**計画してください。

---

## 1. 事前準備（iOS/Android共通）

- [ ] PWA本体がHTTPSで公開され、正常動作している（GitHub Pagesは自動でHTTPS → OK）
- [ ] `manifest.webmanifest` に name / short_name / icons(192,512) / display:standalone / start_url / theme_color が揃っている（**確認済み: 揃っている**）
- [ ] Service Worker（`sw.js`）が登録され、オフラインでも最低限動く
- [ ] **Lighthouse の PWA / Performance スコアを確認**（Google Playは性能スコア80以上が目安）
  - Chromeデベロッパーツール → Lighthouse タブ → モバイルで計測
- [ ] アイコン: `icons/icon-192.png` `icons/icon-512.png` `icons/icon.svg`（**存在確認済み**。新アイコンはユーザー差し替え予定）
- [ ] プライバシーポリシーをWeb上で公開（→ `store/privacy-policy.html` を作成済み。GitHub Pagesで公開する）
- [ ] ストア掲載文を用意（→ `store/listing_ja.md` 作成済み）
- [ ] スクリーンショットを用意（→ `store/screenshots_plan.md` の指定どおり撮影）

---

## 2. Google Play 提出チェックリスト（推奨: PWABuilder / TWA）

### 2-1. アカウント・費用 〔★ユーザー本人作業〕
- [ ] **Google Play Console デベロッパー登録（$25・一回限り）** ※Apple と違い年額ではない
- [ ] Google アカウントに2段階認証を有効化
- [ ] 政府発行の写真付き身分証明書による本人確認（数時間〜2営業日）
- [ ] **【重要・落とし穴】2023年11月以降に作成した「個人」デベロッパーアカウントは、本番公開前に「12人のテスター × 14日間連続のクローズドテスト」が必須**。
  - → 公開までに最低2週間のリードタイムが要る。テスター12人（Googleアカウント）を事前に確保すること。
  - → 「組織（Organization）」アカウントはこの要件の対象外とされる（ただし組織アカウントはD-U-N-S番号等が必要）。個人で出すなら12人テストを織り込む。

### 2-2. パッケージ生成（PWABuilder / Bubblewrap）
- [ ] https://www.pwabuilder.com/ にアプリURLを入力 → Android パッケージを生成
- [ ] パッケージ名（applicationId）を決定（例: `jp.houday.sharomaster` など逆ドメイン形式）
- [ ] **Digital Asset Links（assetlinks.json）を設定**して所有権を検証
  - [ ] Play Console の「アプリ署名」からSHA-256フィンガープリントを取得
  - [ ] `https://makotoikeda1977.github.io/sharo-master/.well-known/assetlinks.json` に正しいSHA-256とパッケージ名を記載して公開
  - [ ] **GitHub Pagesでは `.well-known/` 配下のファイル公開に注意**（ドット始まりディレクトリ）。配置できるか要検証。できない場合は独自ドメイン or 配信方法を検討。
  - ※ assetlinks検証が失敗すると、アドレスバーが出たまま（全画面にならない）or クラッシュ判定になる
- [ ] Service Worker に fetch ハンドラがあること（オフライン応答）
- [ ] オフライン要求リソースが HTTP 200 を返すこと（404/5xxはクラッシュ判定）

### 2-3. ストア掲載情報
- [ ] アプリ名・短い説明・詳細説明（→ `listing_ja.md`）
- [ ] **フィーチャーグラフィック 1024×500px（必須・例外なし）**
- [ ] スクリーンショット 最低2枚（推奨4枚以上）スマホ用
- [ ] アプリアイコン 512×512px（32bit PNG）
- [ ] カテゴリ=教育、コンテンツレーティング質問票への回答
- [ ] プライバシーポリシーURL
- [ ] **データセーフティ（Data safety）フォーム**: 「データを収集・共有しない」「端末内localStorageのみ」を正しく申告

### 2-4. 署名・公開 〔一部★ユーザー本人作業〕
- [ ] Play App Signing を有効化（Googleが署名鍵を管理）
- [ ] AAB（Android App Bundle）をアップロード
- [ ] 内部テスト → クローズドテスト（12人/14日）→ 製品版へ昇格

---

## 3. App Store（iOS）提出チェックリスト（推奨: PWABuilder→ダメならCapacitor）

### 3-1. アカウント・必要機材 〔★ユーザー本人作業〕
- [ ] **Apple Developer Program 登録（$99 / 年・年額更新）**
- [ ] **Mac（必須）** … Xcodeでビルド・アーカイブ・提出する。Windows/Linux不可。
- [ ] **Xcode（最新版）** をインストール
- [ ] App Store Connect でアプリレコードを作成（Bundle ID を登録）

### 3-2. パッケージ生成（まずPWABuilder）
- [ ] https://www.pwabuilder.com/ で iOS の「Store Package」を生成 → zip（Xcodeプロジェクト）をダウンロード
- [ ] 同梱の instructions に従い、Macの Xcode で開く → 署名設定 → アーカイブ → App Store Connect へアップロード

### 3-3. 【最重要】Guideline 4.2 リジェクト対策
PWABuilderのiOS出力は **WKWebViewにPWAを包んだだけ** なので、Appleに「repackaged website（単なるWebサイトの再包装）」と判定されると **Guideline 4.2 でリジェクト**される。以下で「アプリらしさ」を上げる。

- [ ] **ネイティブ機能を最低1つ以上足す**（リジェクト回避の本命。下記いずれか）
  - プッシュ通知（Appleの通知システム経由で「今日の復習」リマインド等）← 学習アプリと相性が良く、説得力が高い
  - ネイティブのスプラッシュ/起動画面・ネイティブナビゲーション
  - オフライン完全動作（機内モードでも全機能が使える＝Web依存でないことを示す）
  - ディープリンク対応
- [ ] **「アプリならではの価値」を審査メモ（Review Notes）で明示**
  - 例: 「全コンテンツを端末内に内蔵しオフライン完結」「SRS（忘却曲線）による出題スケジューリング」「学習進捗の端末内永続化」など、単なるサイト閲覧でない点を文章で説明
- [ ] **アドレスバー・ブラウザUIが一切出ない**こと（standaloneで全画面）
- [ ] 外部サイトへ飛ぶリンク（メール等）はアプリ内で完結 or 適切に処理
- [ ] スプラッシュ→ホームへの遷移がネイティブアプリとして自然
- [ ] （該当なし確認）ギャンブル・宝くじ等の禁止カテゴリでない → 学習アプリなのでOK

> **もしPWABuilder版が4.2でリジェクトされたら**: Capacitor（Ionic）に乗り換える。Capacitorは同じWeb資産（HTML/JS/CSS）をそのまま使いつつ、ネイティブプラグイン（プッシュ通知・ローカル通知・ハプティクス等）を正規に組み込めるため、Guideline 4.2を通しやすい。フロントを書き直す必要はない。

### 3-4. ストア掲載情報（App Store Connect）
- [ ] アプリ名（最大30文字）・サブタイトル（最大30文字）・キーワード（→ `listing_ja.md`）
- [ ] 説明文・プロモーションテキスト
- [ ] カテゴリ=教育（Education）
- [ ] **年齢レーティング質問票**に回答（本アプリは4+想定）
- [ ] **スクリーンショット（必須）**
  - iPhone 6.9"（1320×2868）または 6.7"（1290×2796）… 最低1セット必須
  - **iPadをサポートする場合、iPad用スクショ（13" 2064×2752 等）も別途必須**（→ iPad対応を外すなら「iPhoneのみ」で申請して回避可）
- [ ] **プライバシーポリシーURL（必須）** → `privacy-policy.html` の公開URL
- [ ] **App Privacy（プライバシーラベル）**: 「データを収集しない（Data Not Collected）」を申告（localStorageのみ・送信なし）
- [ ] サポートURL・連絡先（info@houday.jp）

### 3-5. 署名・提出 〔★ユーザー本人作業〕
- [ ] Xcodeで Distribution 証明書・プロビジョニングプロファイルを設定（自動署名でも可）
- [ ] アーカイブ → App Store Connect にアップロード
- [ ] TestFlight で実機確認（任意だが推奨）
- [ ] 審査に提出 → リジェクト時は Resolution Center の指摘に対応

---

## 4. 想定リジェクト理由と対策（早見表）

| # | プラットフォーム | 想定理由 | 対策 |
|---|---|---|---|
| R1 | iOS | **Guideline 4.2**: 単なるWebサイトのラップ | ネイティブ機能（通知等）追加・オフライン完結・Review Notesで価値説明・Capacitor移行 |
| R2 | iOS | プライバシーラベル/ポリシー不備 | privacy-policy.html 公開・「Data Not Collected」申告 |
| R3 | iOS | スクショ寸法不正・iPad欠落 | 規定寸法で用意 or iPhoneのみ申請 |
| R4 | Android | assetlinks 検証失敗（全画面にならない） | SHA-256とパッケージ名を正しく `.well-known/assetlinks.json` に配置 |
| R5 | Android | 個人アカウントの12人/14日テスト未実施 | 事前にテスター12人確保・2週間前倒し |
| R6 | Android | Data safety フォームと実態の不一致 | 「収集なし・端末内のみ」を正確に申告 |
| R7 | 両方 | 法令学習アプリの内容正確性・誇大表現 | listing_ja.md は誇大表現なし・免責記載済み |
| R8 | 両方 | **著作権侵害**: 実際の試験問題（過去問）の逐語掲載 | **過去問を逐語転載しない**。論点に基づく自作○×のみ。詳細は §4.5 |

---

## 4.5 著作権リスク（過去問の扱い）★最重要・必読

公開アプリに **実際の社労士試験の問題（過去問）を逐語で載せると著作権侵害のリスク** があります。2026年6月時点でWeb照合した結論を以下にまとめます。

### 法的整理（要点）
- **試験問題は著作物**。問題文は「言語の著作物」、多肢選択式の構成は「編集著作物」と解されるのが一般。**著作権は試験の実施団体に帰属**します。
  - 社労士試験の実施＝**全国社会保険労務士会連合会（社会保険労務士試験オフィシャルサイト）**。
  - 同種の国家試験である**行政書士試験研究センターは「試験問題の著作権は当センターに帰属」「書籍・ホームページ等への掲載には許諾が必要」「無断で転用・引用することを禁じます」と明言**。社労士試験も同等の扱いと考えるのが安全。
- **著作権法36条（試験問題としての複製）は“試験の実施時”にしか適用されず、過去問集の作成やインターネット公開という二次利用には及びません。** → 「試験問題だから自由に使える」は誤り。
- したがって、**過去問の問題文をそのまま（逐語）アプリに載せるには、実施団体の許諾が必要**。許諾なしの掲載は複製権侵害になり得ます。市販過去問集が成立しているのは、各社が許諾を得ている（または独自に作問している）ためです。

### このアプリでの安全な作り方（推奨方針）
本アプリは「過去問の論点に基づく**自作の○×一問一答**」と「**自作の横断比較表**」で構成する設計にすれば、著作権リスクを大幅に下げられます。

- **OK（安全）**: 過去問で問われた**論点・法令・制度内容**を踏まえ、**自分の言葉で書き起こした**○×問題・解説・比較表。法令の条文・制度の事実そのものは著作権で保護されない（誰が書いても同じになる事実・アイデア）。
- **NG（リスク）**: 実際の試験問題の**文章をそのままコピー**して載せる／過去問サイトや市販問題集の**問題文・解説をコピペ**する。
- **グレー（避ける）**: 適法引用（著作権法32条）に頼る運用。引用が適法となるには「明瞭区別・主従関係（自分の著作物が主）・出所明示・正当な範囲」が必要で、問題集アプリで問題文を“主”として並べると主従が逆転し**引用の要件を満たさない**ことが多い。引用を言い訳にしない。

### 提出前チェック
- [ ] アプリ内の○×問題・解説・比較表が、**過去問や他社教材の逐語コピーでない**（自作である）ことを確認
- [ ] 文言が特定の過去問サイト・市販問題集と**酷似していない**か（content-builder 担当と整合確認）
- [ ] ストア掲載文（listing_ja.md）で「過去問」と書く場合も、**過去問そのものの収録ではなく、過去問の論点に基づく自作問題**である旨を誤認させない表現にする
- [ ] （安全策）アプリ内・掲載文に「本アプリの問題・解説は当方が独自に作成したものであり、試験実施団体とは関係ありません」といった**非提携の明記**を検討

> 補足（2026-06-18 時点のリポジトリ状況）: team-lead により ○×カードは一旦全削除（commit 598fac5・1054→0、横断比較表は保持）されています。**今後 content-builder が追加する○×は最初から“自作・逐語転載なし”を前提に作る**こと。問題数を増やす際もこの原則を最優先する。

---

## 5. ★ユーザー本人にしかできない作業（明確分離）

機材・アカウント・実機・本人確認・送信操作は本人作業です。準備担当（私）は文書・設定値・手順を整えますが、以下は池田さん本人が行う必要があります。

1. **Apple Developer Program 登録（$99/年）** — 本人名義・支払い
2. **Google Play Console 登録（$25・一回限り）** — 本人名義・支払い・身分証本人確認
3. **Mac + Xcode の用意とビルド/署名/アップロード** — 本人のMacが必要
4. **Google Play 個人アカウントの12人テスター手配＋14日テスト** — テスター（知人のGoogleアカウント12人）確保
5. **新アイコン差し替え**（予定どおり）
6. **スクリーンショットの実機撮影**（`screenshots_plan.md` の指定に従う。自動生成案も同ファイルに記載）
7. **各ストアの最終「提出」ボタン押下** — 外向き公開行為のため本人が実施
8. **（iOSがリジェクトされた場合）ネイティブ機能追加 or Capacitor移行の意思決定**

---

## 6. 未解決・要確認事項（team-lead/ユーザーへ）

- [ ] **iOS対応の覚悟**: Guideline 4.2リジェクトはほぼ織り込み。「リジェクト前提でネイティブ機能追加 or Capacitor移行」まで踏み込むか、それとも当面 **Google Playのみ** で出すか、方針決定が必要。
- [ ] **iPad対応の可否**: iPad対応にするとiPad用スクショが追加で必須。iPhoneのみ申請にして手間を減らす選択も可。
- [ ] **【更新】`.well-known/assetlinks.json` の配置（サブパス問題）**: TWAのassetlinksは「アプリ起動URLの**オリジン直下**」= `https://makotoikeda1977.github.io/.well-known/assetlinks.json` に置く必要があり、**現状のサブパス公開（/sharo-master/）では検証が通らない見込み**。対策＝**独自ドメイン（例 `sharo.houday.jp` をCNAME割当）でルート公開するのが最有力**（manifestのstart_url/scopeもそのドメインに合わせる）。代替: makotoikeda1977.github.io をこのアプリ専用ユーザーページにする／Cloudflare Pages等でルート公開。**Android優先なら公開オリジンの確定が先決**。
- [ ] **過去問の著作権（§4.5）**: ○×を再追加する際、過去問・他社教材の逐語コピーを載せない方針を content-builder と共有・徹底する。
- [ ] **パッケージ名（applicationId / Bundle ID）の確定**: 例 `jp.houday.sharomaster`。独自ドメイン houday.jp を持つので `jp.houday.*` が自然。
- [ ] **個人 vs 組織アカウント**: Google Playを個人で出すと12人テスト要件、組織だとD-U-N-S番号。どちらで行くか。

---

## 参考リンク（2026年6月照合）

- PWA出版の現実（2026）: https://www.mobiloud.com/blog/publishing-pwa-app-store
- PWABuilder iOS手順: https://blog.pwabuilder.com/posts/publish-your-pwa-to-the-ios-app-store/
- PWABuilder iOS（コミュニティ運営・注意点）: https://github.com/pwa-builder/pwabuilder-ios-app-store
- Bubblewrap（TWA CLI）: https://github.com/GoogleChromeLabs/bubblewrap
- TWAクイックスタート: https://developer.chrome.com/docs/android/trusted-web-activity/quick-start/
- Apple Developer 料金: https://developer.apple.com/support/compare-memberships/
- Google Play $25・12人テスト要件（2026）: https://www.iconikai.com/blog/google-play-developer-account-fee-2026
- App Storeスクショ仕様（Apple公式）: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- 過去問題集と著作権（36条が二次利用に及ばない）: https://www.jcea.info/nyushi2.html
- 行政書士試験研究センター 著作権（試験問題の著作権帰属・許諾要・無断転用禁止／社労士の参考）: https://gyosei-shiken.or.jp/doc/about/copyright.html
- 社会保険労務士試験オフィシャルサイト（実施＝全国社会保険労務士会連合会）: https://www.sharosi-siken.or.jp/
- 適法引用の要件（32条・明瞭区別/主従関係/出所明示）: https://chosakukenhou.jp/inyou/
- Google Playプレビュー資産（公式）: https://support.google.com/googleplay/android-developer/answer/9866151
- Capacitor（PWA→ネイティブ）: https://capacitorjs.com/docs/web/progressive-web-apps
