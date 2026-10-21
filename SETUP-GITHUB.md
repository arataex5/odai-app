# お題ボックス を GitHub にのせて APK を作るまで（はじめての人向け）

所要時間 15〜20分ほど。プログラミングの知識は要りません。

---

## 0. 用語（これだけ知っていればOK）

| 言葉 | 意味 |
|---|---|
| **リポジトリ（repository / repo）** | GitHub 上のプロジェクト用フォルダ |
| **push（プッシュ）** | 手元のパソコンのファイルを GitHub に**送ること**。「アップロード」と同じ意味 |
| **commit（コミット）** | 変更をひとまとめにして記録すること。push の前段階 |
| **Actions（アクションズ）** | GitHub 上で自動作業をしてくれる仕組み。**ファイルが送られてきたときに動きます** |
| **Pages（ページズ）** | GitHub がリポジトリの中身をウェブサイトとして公開してくれる機能 |

> ⚠️ **Actions が動かない一番の原因は「まだファイルを送っていない」ことです。**
> リポジトリを作っただけでは中身が空なので、Actions も動きません。

---

## 1. 送るファイルの場所を確認する

デスクトップの `お題アプリ` フォルダの中が、こうなっているはずです。

```
デスクトップ
└─ お題アプリ          ← ★ここが「送る中身」
   ├─ index.html
   ├─ sw.js
   ├─ package.json
   ├─ css / js / data / icons / assets / tools / download
   └─ .github        （隠しフォルダ。表示されていなくてもOK）
```

**★の `お題アプリ` フォルダの中身**（`index.html` がある階層）をまるごと GitHub に送ります。

> 隠しフォルダ `.github` が見えないときは、エクスプローラーの
> 「表示」→「表示」→「隠しファイル」にチェックを入れてください。
> このフォルダに Actions の設定が入っているので、**これも必ず送ります**。
> もし `.github` が無く、代わりに `github-workflows` フォルダがある場合は、
> `.github\workflows` というフォルダを作って中身を移してください。

---

## 2. GitHub Desktop で送る（おすすめ・確実）

ブラウザからのアップロードは `.github` のような**ドットで始まるフォルダが無視されることがある**ため、
専用アプリの **GitHub Desktop** を使うのが確実です。日本語ではありませんが、押すボタンは3つだけです。

### 2-1. インストールとサインイン

1. <https://desktop.github.com/> から GitHub Desktop をダウンロードしてインストール
2. 起動して **Sign in to GitHub.com** → ブラウザで GitHub アカウントにログイン
3. 名前とメールを聞かれたら、そのまま **Finish**

### 2-2. フォルダをリポジトリにする

1. メニュー **File → Add local repository...**
2. **Choose...** を押して、★の `お題アプリ` フォルダ
   （`デスクトップ\お題アプリ`）を選ぶ
3. 「this directory does not appear to be a Git repository」と出るので、
   青い文字の **create a repository** をクリック
4. 出てきた画面で **Create repository** を押す（設定はそのままでOK）

### 2-3. GitHub に送る（＝push）

1. 画面左下に「Summary」という入力欄があるので `first commit` などと入力し、
   **Commit to main** を押す（これが commit）
2. 画面上部の **Publish repository** を押す
3. **Name** は `odai-app`（好きな名前でOK・半角英数字）
4. ⚠️ **「Keep this code private」のチェックを外す**（無料アカウントで Pages を使うため）
5. **Publish repository** を押す ← **これが push です**

これで GitHub にファイルが届き、**Actions が自動で動き始めます**。

---

## 3. GitHub 側の設定（初回だけ）

ブラウザで自分のリポジトリ（`https://github.com/ユーザー名/odai-app`）を開いて、

### 3-1. Actions に書き込み権限を与える

**Settings → Actions → General** →
一番下の **Workflow permissions** で
**「Read and write permissions」** を選んで **Save**

> APK をリポジトリの `download/` に保存するために必要です。

### 3-2. Pages を有効にする

**Settings → Pages → Build and deployment → Source** を
**「GitHub Actions」** にする

### 3-3. 設定を反映させるため、もう一度動かす

3-1 は**設定より前に動いた分には効かない**ので、Actions を1回動かし直します。

**Actions** タブ → 左の一覧から **Build APK** → 右上の **Run workflow** → 緑の **Run workflow**

---

## 4. 動いているか確認する

**Actions** タブを開くと、実行の一覧が出ます。

| 表示 | 意味 |
|---|---|
| 🟡 黄色の丸 | 実行中（APKビルドは初回10〜15分かかります） |
| ✅ 緑のチェック | 成功 |
| ❌ 赤いバツ | 失敗（クリックすると赤い行にエラー内容が出ます） |

### 何も表示されない場合

- **`.github` フォルダが送られていない**可能性が高いです。
  リポジトリのトップページに `.github` が表示されているか確認してください。
  無ければ「5. うまくいかないとき」を見てください。
- リポジトリのトップに `index.html` がありますか？
  `お題アプリ/index.html` のように**1階層深く**なっていると、Actions は動きません。

---

## 5. できあがったAPKの受け取り方

成功したら、3つの場所から取れます。

1. **Releases**（リポジトリ右側の Releases）→ `お題ボックス v1.0.0` → `app-debug.apk`
2. **Actions** の実行結果ページ下部 **Artifacts** → `odai-box-apk-v1.0.0`
3. **公開ページから**（いちばん楽）
   `https://ユーザー名.github.io/odai-app/` をスマホで開く →
   タイトル画面に「オフラインで使えるアプリをインストールする」ボタンが出る → そこからダウンロード

> ボタンは APK ができてから表示されます（`download/apk-info.json` を見て自動判定しています）。
> Pages への反映に数分かかることがあります。

### スマホにインストールする

1. ダウンロードした `odai-box.apk` を開く
2. 「不明なアプリのインストール」を許可
3. 「Play Protect によりブロック」と出たら「詳細」→「無視してインストール」

> 署名鍵を設定していない場合は debug 署名の APK になります。**普通にインストールして遊べます。**
> ちゃんとした署名を付けたい場合は README の「署名について」を参照してください。

---

## 6. うまくいかないとき

| 症状 | 対処 |
|---|---|
| Actions タブに何も出ない | `.github/workflows/build-apk.yml` がリポジトリにあるか確認。無ければ下の「手動で作る方法」 |
| Actions が Disabled と出る | Settings → Actions → General → 「Allow all actions」を選択 |
| 赤いバツ（push 失敗系のエラー） | Settings → Actions → General → Workflow permissions を「Read and write」にして再実行 |
| Pages が 404 | Settings → Pages の Source が「GitHub Actions」か確認。Deploy Pages の実行が緑になっているか確認 |
| ダウンロードボタンが出ない | Build APK が緑になっているか、`download/odai-box.apk` がリポジトリにあるか確認 |

### `.github` を手動で作る方法（ブラウザだけで）

1. リポジトリのトップで **Add file → Create new file**
2. ファイル名の欄に `.github/workflows/build-apk.yml` と**そのまま入力**
   （`/` を打つとフォルダが自動で作られます）
3. パソコンの `お題アプリ\.github\workflows\build-apk.yml` を**メモ帳で開いて全文コピー**し、貼り付け
4. 下の **Commit changes** を押す
5. 同じ手順で `.github/workflows/pages.yml` も作る

---

## 7. 2回目以降の更新のしかた

ファイルを直したら、GitHub Desktop で

1. 左下の Summary に何をしたか書く（例：`お題を追加`）
2. **Commit to main**
3. 上の **Push origin**

これだけで、APK の作り直しとページの更新が自動で走ります。

> アプリの中身を変えたときは `sw.js` と `js/core/store.js` の `APP_VERSION` を上げてください。
> APK のバージョン表記にもそのまま使われます。
