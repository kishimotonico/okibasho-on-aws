/**
 * アップロードされた index.html から表示用 title を拾う。
 * untrusted な HTML はクライアント側だけで読み、サーバーには送らない。
 */
export async function extractTitleFromHtml(file: Blob): Promise<string | null> {
  const text = await file.text();
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(text);
  if (!match) {
    return null;
  }

  const title = match[1]?.replace(/\s+/g, ' ').trim();
  return title && title.length > 0 ? title : null;
}
