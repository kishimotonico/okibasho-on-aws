/**
 * 外部共有 URL の tag 計算。packages/cli/src/page/tag.ts と同じ仕様の複製。
 *
 * projector は @cli/page パッケージに依存しない構成にしているため、ここに複製している
 * (web は path alias で @cli/page を直接読めるが、projector は NodejsFunction が
 * このディレクトリ単体を esbuild で束ねる構成のため、依存を増やさない)。
 * 仕様を変えるときは両方直し、同じ固定テストベクターで一致することを確認すること。
 *
 * tag = base64url(SHA-256(UTF-8(prefix))) の先頭11文字(パディング無し)。
 * prefix は "pages/<email>/<slug>/" (ページ成果物の prefix)そのもの
 */
const TAG_LENGTH = 11;

export async function computeShareTag(prefix: string): Promise<string> {
  const data = new TextEncoder().encode(prefix);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Buffer.from(digest).toString('base64url').slice(0, TAG_LENGTH);
}
