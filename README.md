# syukatsu Entry Autofill (Tampermonkey)

ブラウザ上に **操作パネル** を表示し、パネルに入力して保存したプロフィールを **ワンクリック** で
採用マイページの登録フォームに自動入力します。マイナビ等の情報を連携できている場合は不足項目を充足します。

本リポジトリには **個人情報は一切含まれていません**。

## 対応URL（初期）
- `https://job.axol.jp/bx/s/*/entry/input*`
- `https://job.axol.jp/bx/s/*/navi/input*`

> ほかのページにも対応させたい場合は `userscript/syukatsu-autofill.user.js` の `@match` を追加してください。

## 使い方（インストール）
1. Chrome/Edge/Firefox に [Tampermonkey](https://www.tampermonkey.net/) をインストール。
2. Tampermonkey で「新規スクリプト」を開き、`userscript/syukatsu-autofill.user.js` の内容を **そのまま貼り付けて保存**。
   - もしくは GitHub の **Raw** を開いて「インストール」。
3. 対象ページを開くと右下に **🧩 Autofill** ボタンが出ます。

## 使い方（操作）
- **パネルに入力 → Save**：ブラウザ（Tampermonkey ストレージ / localStorage）に保存。
- **Fill Current Page**：保存済みプロフィールを使って開いているページに自動入力。
- **Export / Import**：JSON でバックアップ・移行が可能。

> この段階ではリポジトリ内に一切の個人情報を含めていません。保存は各PCのブラウザ上で行われます。

## 入力対象（主な `name` / `id`）
- 氏名・カナ：`kanji_sei`, `kanji_na`, `kana_sei`, `kana_na`
- 性別（ラジオ）：`sex`（1=男性, 2=女性）
- 生年月日（年/月/日）：`birth_Y`, `birth_m`, `birth_d`
- 現住所：郵便（`yubing_h`, `yubing_l`）、都道府県（select `#keng`）、市区郡町村（`jushog1`）、町域・番地（`jushog2`）、建物（`jushog3`）
- 電話：自宅（`telg_h/m/l`）、携帯（`keitai_h/m/l`）
- メール：`email` / `email2`、任意で `kmail` / `kmail2`
- 休暇中連絡先（必要時）：郵便（`yubink_h/l`）、都道府県（select `#kenk`）、住所各欄、電話（`telk_h/m/l`）
- 学校情報：`kubun`（学校区分, radio）, `kokushi`（設置区分, radio）, `initial`, `dcd` or `dname`, `bcd` or `bname`, `paxcd` or `kname`, 入学/卒業（`school_from_Y/m`, `school_to_Y/m`）, `zemi`, `club`

## 注意
- 自動化は必ずサイトの利用規約に従ってください。送信前の最終確認は各自でお願いします。
- フォームのDOM構造が変わった場合は、セレクタを調整してください。
- 送信ボタン自動クリックは **デフォルト無効**（`AUTO_SUBMIT = false`）。必要に応じて変更してください。

## フォルダ構成
```
syukatsu-autofill/
├─ README.md
├─ userscript/
│  └─ syukatsu-autofill.user.js
└─ profiles/
   └─ sample_profile.json
```
