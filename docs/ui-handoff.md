# UI/UX 改善のための引き継ぎ

デザイン担当者がフロントエンド（`packages/web`）のUI/UXに手を入れるための資料。ここに書いたのは実際に手元で確認した内容だけで、推測は「要確認」と明記した。

## 前提

- フロントは `packages/web`（TanStack Start / React 19、SPAモード）。ブラウザから `@aws-sdk/client-s3` で直接S3を叩く。API層はない。認証は Cognito Hosted UI + `oidc-client-ts`。
- 以下は「AWS未接続でUIの見た目だけを確認する」手順。ダミーの環境変数とブラウザ内モックを使うので、デプロイ済みの環境や認証情報が無くても試せる。

## ローカル起動手順

### 1. ダミー `.env` を置く

`packages/web/.env` は `.gitignore` で `*.env*`（`.env.example` 除く）が除外済みなので、値はダミーで構わない。

```bash
cat > packages/web/.env <<'EOF'
VITE_HOSTED_UI_BASE_URL=https://dummy.auth.ap-northeast-1.amazoncognito.com
VITE_OIDC_ISSUER=https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_dummy00
VITE_WEB_APP_CLIENT_ID=dummyclientid0000000000000
VITE_IDENTITY_POOL_ID=ap-northeast-1:00000000-0000-0000-0000-000000000000
VITE_USER_POOL_ID=ap-northeast-1_dummy00
VITE_REGION=ap-northeast-1
VITE_PAGES_BUCKET=dummy-pages-bucket
VITE_PAGES_BASE_URL=https://pages.example.local
EOF
```

### 2. dev server を起動する

```bash
pnpm --filter @okibasho/web dev
```

`http://localhost:3000/` を開けばトップページが表示される（未ログイン状態）。以前は `vite.config.ts` の `server.fs.allow` が `packages/cli` だけを指していたため、`src` 配下が403になり画面が出なかった。今はワークスペースルートまで許可して解消している。CDK側でCognitoのコールバックURLに `http://localhost:3000/callback` が登録済みなので、ポート番号は3000のまま変えないこと（`packages/infra/lib/constructs/auth.ts` 参照）。

### 3. 恒久的なモックモードは作らない

`VITE_MOCK=1` のような恒久フラグでS3/認証をまるごとフェイク実装に切り替える仕組みは意図的に作っていない。抽象化層を増やさない方針のため。将来どうしても必要になった場合は、`createPagesS3Client`（`src/lib/s3-client.ts`）と `createUserManager`（`src/auth/user-manager.ts`）の呼び出し側を差し替え可能にする案が考えられるが、現状はブラウザのDevTools側でその場しのぎのモックをする運用で十分と判断している。

## ログイン済み状態 / My Pages データのモック手順

実際に動作確認できた方法。ブラウザのコンソール（DevTools、またはagent-browserの`eval`）に貼るだけで反映される。

### ログイン状態にする

`oidc-client-ts` は `UserManager` が `sessionStorage` にユーザー情報をJSONで保存する（`src/auth/user-manager.ts:11`）。キー名は `oidc.user:<authority>:<client_id>` で、`.env` の `VITE_OIDC_ISSUER` と `VITE_WEB_APP_CLIENT_ID` から組み立てる。

```js
const authority = 'https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_dummy00'; // VITE_OIDC_ISSUER
const clientId = 'dummyclientid0000000000000'; // VITE_WEB_APP_CLIENT_ID
const key = `oidc.user:${authority}:${clientId}`;
const now = Math.floor(Date.now() / 1000);
sessionStorage.setItem(key, JSON.stringify({
  id_token: 'dummy.id.token',
  access_token: 'dummy-access-token',
  token_type: 'Bearer',
  scope: 'openid email profile',
  profile: { sub: 'dummy-sub-0001', email: 'test.user@example.com', email_verified: true },
  expires_at: now + 3600,
}));
```

このあとページをリロードすると `useAuth().isAuthenticated` が `true` になり、ヘッダーにメールアドレスとログアウトボタンが出る。

### My Pages に一覧データを出す

S3クライアントは `fromCognitoIdentityPool`（`src/lib/s3-client.ts:13`）で認証情報を取得し、実際の通信は `window.fetch` 経由で行われる（`@aws-sdk/client-s3` の既定HTTPハンドラ）。これを丸ごと横取りするのが一番手っ取り早い。

手順：

1. 上記のログイン状態モックを入れる。
2. トップページを開いた状態で、`window.fetch` を差し替えるスクリプトをコンソールに貼る（下記）。
3. 画面内のリンクをクリックして `/my-pages` に**SPA遷移**する（`window.location`でフルリロードすると`fetch`の差し替えが消えるので、必ずアプリ内のリンククリックで遷移する）。

```js
(function () {
  const email = 'test.user@example.com';
  const bucket = 'dummy-pages-bucket'; // VITE_PAGES_BUCKET と一致させる
  const now = Date.now();
  const pages = {
    'demo-page': {
      slug: 'demo-page', owner: email,
      createdAt: new Date(now - 10 * 86400000).toISOString(),
      expiresAt: new Date(now + 20 * 86400000).toISOString(),
    },
    'expired-page': {
      slug: 'expired-page', owner: email,
      createdAt: new Date(now - 40 * 86400000).toISOString(),
      expiresAt: new Date(now - 10 * 86400000).toISOString(),
    },
    'forever-page': {
      slug: 'forever-page', owner: email,
      createdAt: new Date(now - 5 * 86400000).toISOString(),
      expiresAt: null,
    },
  };

  const orig = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const headers = (init && init.headers) || {};
    const target = headers['x-amz-target'] || headers['X-Amz-Target'] || '';

    if (url.includes('cognito-identity.')) {
      if (String(target).includes('GetId')) {
        return new Response(JSON.stringify({ IdentityId: 'ap-northeast-1:dummy-identity-id' }),
          { status: 200, headers: { 'content-type': 'application/x-amz-json-1.1' } });
      }
      return new Response(JSON.stringify({
        IdentityId: 'ap-northeast-1:dummy-identity-id',
        Credentials: {
          AccessKeyId: 'ASIADUMMYDUMMYDUMMY',
          SecretKey: 'dummySecretKeyDummySecretKeyDummySecretKey',
          SessionToken: 'dummySessionTokenDummySessionToken',
          Expiration: Math.floor(now / 1000) + 3600,
        },
      }), { status: 200, headers: { 'content-type': 'application/x-amz-json-1.1' } });
    }

    if (url.includes(bucket)) {
      const u = new URL(url, window.location.href);
      const method = (init && init.method) || 'GET';

      if (method === 'GET' && u.searchParams.get('list-type') === '2') {
        const prefix = u.searchParams.get('prefix') || '';
        const items = Object.keys(pages)
          .map((slug) => `<CommonPrefixes><Prefix>${prefix}${slug}/</Prefix></CommonPrefixes>`)
          .join('');
        const xml = `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/"><Name>${bucket}</Name><Prefix>${prefix}</Prefix><Delimiter>/</Delimiter><IsTruncated>false</IsTruncated>${items}</ListBucketResult>`;
        return new Response(xml, { status: 200, headers: { 'content-type': 'application/xml' } });
      }

      if (method === 'GET' && u.pathname.includes('.metadata.json')) {
        const decoded = decodeURIComponent(u.pathname);
        const parts = decoded.split('/').filter(Boolean);
        const slug = parts[parts.length - 2];
        const meta = pages[slug];
        if (!meta) return new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 });
        return new Response(JSON.stringify(meta), { status: 200, headers: { 'content-type': 'application/json' } });
      }

      if (method === 'PUT') return new Response(null, { status: 200, headers: { etag: '"dummy-etag"' } });
      if (method === 'POST') return new Response('<DeleteResult></DeleteResult>', { status: 200, headers: { 'content-type': 'application/xml' } });
    }

    return orig(input, init);
  };
})();
```

これで `demo-page`（残り日数あり）・`expired-page`（期限切れ）・`forever-page`（無期限）の3件が一覧に出る。期限切れ行の表示バグ（後述）を確認するために `expired-page` を混ぜてある。

## 画面と主要ファイルの対応表

| URL | ルートファイル | 主に使うコンポーネント / lib |
| --- | --- | --- |
| `/` | `src/routes/index.tsx` | なし（静的な説明文のみ） |
| `/upload` | `src/routes/upload.tsx` | `lib/collect-upload-files.ts`, `lib/validate-upload.ts`, `lib/read-data-transfer.ts`, `lib/pages-s3.ts`, `lib/s3-client.ts` |
| `/my-pages` | `src/routes/my-pages.tsx` | `lib/expiration-status.ts`, `lib/format-datetime.ts`, `lib/retention-warning.ts`, `lib/pages-s3.ts` |
| `/callback` | `src/routes/callback.tsx` | `auth/auth-context.tsx`, `auth/user-manager.ts` |
| 存在しないパス | `src/components/NotFoundPage.tsx`（`__root.tsx` の `notFoundComponent`） | - |
| 全ページ共通 | `src/routes/__root.tsx` | `components/AppHeader.tsx`, `auth/auth-context.tsx` |

## スタイルの現状

- CSSは `src/styles/app.css` 1ファイルのみ。プレーンCSS（Tailwindや CSS Modules は無し）。クラス名は手書きのBEM風（`.page-table__url` など）。
- デザイントークン（CSS変数によるカラーパレットやスペーシングの定義）は無い。色・角丸・余白は各ルールにハードコードされている。
- 共通UIコンポーネント（Button、Table、Badgeのようなもの）は無い。`className="button"` のようなCSSクラスの直付けのみで、Reactコンポーネントとしての共通化はされていない。
- レスポンシブ対応のメディアクエリは1つも無い（`app.css` 全体でモバイル幅を意識した記述が無い）。ヘッダーやテーブルの崩れはこれが直接の原因。
- ダークモード対応（`prefers-color-scheme`）も無い。`:root { color-scheme: light }` で明示的にライト固定。

## 既知の問題

重要度順。すべて実機（Chromium、agent-browser経由）で確認済み。

### バグ・高

**期限切れ行が「期限切れ」と表示されない**（`src/lib/expiration-status.ts:13-34`, `src/routes/my-pages.tsx:234-236`）

`getExpirationStatus` は `expiresAt` が過去なら `{ kind: 'expired', label: '期限切れ' }` を返す。しかし呼び出し側の `my-pages.tsx` はこう分岐している。

```tsx
{page.expiresAt
  ? `削除予定: ${formatDateTime(page.expiresAt)}`
  : expiration.label}
```

`expiresAt` が非null（temporary）である限り、期限切れかどうかに関わらず常に「削除予定: 〈日時〉」を表示する。`expiration.label`（＝「期限切れ」や「無期限」）が実際に表示されるのは `expiresAt === null`（permanent）のときだけで、この場合 `expiration.kind` は必ず `'permanent'` なので「期限切れ」という文字列が画面に出ることは構造上あり得ない。行の背景色（`page-row--expired`）や日時の赤字（`expiration--expired`）はkindベースで正しく付くため、「日時は過去なのに赤字で “削除予定” のまま」という見た目になる。モック環境で `expired-page` を使って実際に再現した（前述のモック手順で再現できる）。

**ログイン後の戻り先がほぼ全部トップに飛ぶ**（`src/routes/callback.tsx:22`, `src/auth/auth-context.tsx:94`）

`auth-context.tsx` の `login()` は `pathname + search` をまるごと `saveReturnPath` で保存する（例: `/upload?slug=foo` や `/my-pages`）。ところが `callback.tsx` はこう書かれている。

```tsx
if (returnTo === '/upload') {
  void navigate({ to: '/upload', search: {} });
} else {
  void navigate({ to: '/' });
}
```

完全一致が `/upload` のときだけ `/upload` に飛び、それ以外（`/my-pages` や `search` 付きの `/upload?slug=xxx`）は全部 `/` に飛ぶ。「My Pagesを見ようとしてログイン→トップに戻される」「再アップロードのためにログイン→slugが失われる」が起きる。

### UI・中

**モバイル幅（390px）でヘッダーが崩れる**（`src/components/AppHeader.tsx`, `src/styles/app.css:51-54`）

`.nav { display: flex; gap: 1rem; }` にレスポンシブ対応が無く、ナビ項目（アップロード / My Pages / メールアドレス / ログアウト）を折り返せない分だけ各リンクの文字が1文字ずつ縦に割れて描画される。ログイン済み状態はメールアドレス表示が加わる分、崩れがさらに悪化し、ヘッダー全体が横スクロールしないと右端の「ログアウト」に届かない。

**My Pages テーブルがモバイルで窮屈**（`src/routes/my-pages.tsx:219-223`, `src/styles/app.css:282-285`）

`.table-wrap { overflow-x: auto }` はあるが、`table` 自体に `min-width` や `white-space: nowrap` が無いため、テーブルは横スクロールではなく列を圧縮する方向に潰れる。結果として閲覧URL列（`.page-table__url { max-width: 16rem; word-break: break-all }`）がURLを1文字ずつ改行し、セルが極端に縦長になる。

**保存期間の切り替えUIで同じ語が3回並ぶ**（`src/routes/my-pages.tsx:225-255`）

保存期間セルの中に、現在値のラベル（`retentionLabel`）、期限の説明（`expiration.label`、ただし上記バグにより実際は「削除予定: 日時」）、そして操作用のテキストボタン「30日」「無期限」の3つが縦に並ぶ。操作ボタンは現在値の方が`disabled`になるだけの見た目で、どれが現在の状態を示す表示でどれが押せる操作なのか区別が付きにくい。

**操作列のボタンが縦積みで行が高い**（`src/routes/my-pages.tsx:257-286`, `src/styles/app.css:307-312`）

`.row-actions { flex-direction: column }` で「再アップロード」「URLをコピー」「削除」が縦に3つ並ぶ。「URL をコピー」はボタン幅に対して文字が長く、2行に折り返る。

### UI・低

**トップページの情報量が少ない**（`src/routes/index.tsx`）

見出し1つ・説明文1行・ボタン2つのみ。サービスの使い方（誰向けか、URLの形式、保存期間の仕組みなど）の説明が無い。

**単一HTMLアップロード時にファイル名が `index.html` に強制される仕様がUIに出ていない**（`src/lib/collect-upload-files.ts:85-91`, `src/routes/upload.tsx:250-261`）

単一ファイル選択でHTMLファイルを1つ選ぶと、実際のファイル名に関わらずページ内パスは常に `index.html` になる（`collectUploadFilesFromFileList` 内、`collectUploadFilesFromPathEntries` も同様）。選択中ファイル一覧（`upload.tsx`の`file-list`）には変換後のパス `index.html` だけが表示され、元のファイル名は画面のどこにも出ない。実際に `test-upload.html` という名前のファイルを選ぶと一覧に「index.html (40 bytes)」とだけ表示されることを確認した。

### 要確認

**初回ロード時のhydration mismatch警告**

これは今回の検証では再現しなかった。修正前の `vite.config.ts`（`server.fs.allow` が `packages/cli` だけを指し、`src` 配下が403になっていた状態）ではコンソールに `Failed to fetch dynamically imported module` に付随する警告が出るが、正常に読み込めた状態ではhydration関連の警告は出なかった。以前の報告はこの問題を踏んだ際の副次的な症状だった可能性がある。

## 触ってはいけない箇所・制約

- `src/lib/s3-client.ts`・`src/lib/pages-s3.ts`・`src/auth/user-manager.ts` はAWSの実際の認証・データ構造（Cognito Identity Pool、S3オブジェクトキーの構成）に直結している。見た目の変更に付随してこれらのロジックを変える場合は、`packages/cli/src/page`（S3キー構成やmetadata形式の定義元）との整合を崩さないこと。
- `vite.config.ts` の `server.port: 3000` は変更しないこと。CDK側（`packages/infra/lib/constructs/auth.ts`）でCognitoのコールバックURLとして `http://localhost:3000/callback` が登録される前提になっている。
- ルーティングは `src/router.tsx` で `spa: { enabled: true }` のprerender構成になっている。SSRやサーバー関数は使わない設計（`README.md`、`docs/architecture.md`）なので、データ取得をサーバー側に持っていくような変更はしないこと。
- `packages/web/src/auth/user-manager.ts` はセッションストレージを意図的に選んでいる（コメントに理由あり）。untrusted なアップロード先ページとのSame-Origin Policyによる分離が設計上の主要な防御であるため、認証情報の保存先をlocalStorage等に変える提案は避けること。

## 検証方法

実行したコマンドと結果。

```bash
pnpm --filter @okibasho/web typecheck   # tsc --noEmit、エラー無し
pnpm --filter @okibasho/web test        # vitest run、9ファイル31テストすべてpass
pnpm --filter @okibasho/web build       # vite build（client/ssr）+ prerender、成功
```

リポジトリ全体にlintコマンド（ESLintなど）は設定されていない（ルートの`package.json`に`lint`スクリプト無し、ESLint設定ファイルも無し）。フォーマットは`prettier`（`pnpm format` / `pnpm format:check`）のみ。
