import {
  buildViewUrl,
  computeShareTag,
  retentionFromExpiresAt,
  type PageMetadata,
  type PageShare,
  type PageStore,
  type Retention,
} from '@okibasho/core';

/** 一覧の 1 行。metadata に、画面が使う値（公開URL・保存期間・共有 URL の tag）を足したもの */
export interface ListedPage {
  slug: string;
  owner: string;
  createdAt: string;
  expiresAt: string | null;
  retention: Retention;
  viewUrl: string;
  /**
   * 外部共有 URL の tag（11文字）。computeShareTag は非同期(WebCrypto)なので、
   * ShareDialog が同期のままで済むよう一覧取得時にここへ計算済みの値を持たせる
   */
  shareTag: string;
  share?: PageShare;
  /**
   * 一覧取得時に ListObjectsV2 で見えた metadata の ETag。次回の一覧取得で差分の材料にする。
   * 書き込み直後に作る行（アップロード・保存期間変更・共有設定変更）には無い
   */
  etag?: string;
}

/**
 * metadata と slug から一覧の行を組み立てる。書き込み直後の差し替えと、一覧取得
 * （PageStore.list の結果）の変換の両方で使う。shareTag（computeShareTag）は WebCrypto を使うため非同期
 */
export async function listedPageFromMetadata(
  email: string,
  slug: string,
  metadata: PageMetadata,
  pagesBaseUrl: string,
  etag?: string,
): Promise<ListedPage> {
  const shareTag = await computeShareTag(email, slug);
  return {
    slug,
    owner: email,
    createdAt: metadata.createdAt,
    expiresAt: metadata.expiresAt,
    retention: retentionFromExpiresAt(metadata.expiresAt),
    viewUrl: buildViewUrl(pagesBaseUrl, email, slug),
    shareTag,
    ...(metadata.share ? { share: metadata.share } : {}),
    ...(etag ? { etag } : {}),
  };
}

/**
 * listedPageFromMetadata の逆。一覧の行から、差し替えアップロードで引き継ぐ metadata を作る。
 * 一覧が同じ内容を持っているので、差し替えのたびに S3 を読み直す必要はない。
 */
export function pageMetadataFromListed(page: ListedPage): PageMetadata {
  return {
    createdAt: page.createdAt,
    expiresAt: page.expiresAt,
    ...(page.share ? { share: page.share } : {}),
  };
}

/**
 * previous（前回取得した一覧）を渡すと、PageStore.list の差分取得に使う。
 * etag を持つ行だけが差分の材料になる（書き込み直後に作った行は次回まるごと取り直される）
 */
export async function listPages(
  store: PageStore,
  email: string,
  pagesBaseUrl: string,
  previous?: readonly ListedPage[],
): Promise<ListedPage[]> {
  const previousStored = (previous ?? []).flatMap((page) =>
    page.etag ? [{ slug: page.slug, etag: page.etag, metadata: pageMetadataFromListed(page) }] : [],
  );

  const pages = await store.list(previousStored);
  return Promise.all(
    pages.map(({ slug, metadata, etag }) =>
      listedPageFromMetadata(email, slug, metadata, pagesBaseUrl, etag),
    ),
  );
}
