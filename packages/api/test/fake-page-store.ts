import type {
  GetJsonResult,
  ListKeysResult,
  ListUserIndexKeysResult,
  PageStore,
} from '../src/page-store.js';

export class FakePageStore implements PageStore {
  readonly objects = new Map<string, unknown>();
  readonly tags = new Map<string, Record<string, string>>();
  readonly invalidJsonKeys = new Set<string>();
  readonly deleteCalls: string[][] = [];
  readonly putJsonCalls: Array<{ key: string; body: unknown }> = [];
  readonly setObjectTagsCalls: Array<{ key: string; tags: Record<string, string> }> = [];
  readonly failDeleteKeys = new Set<string>();
  listResult: ListUserIndexKeysResult = { keys: [], truncated: false };
  listKeysResult: ListKeysResult = { keys: [], truncated: false };
  listKeysCalls: string[] = [];
  getJsonCalls: string[] = [];
  /** presignPut の呼び出し記録。Lifecycle用タグが署名対象に渡ったかの確認に使う */
  readonly presignCalls: Array<{
    key: string;
    contentType: string;
    contentLength: number;
    tagging: string | null;
  }> = [];
  private failPutIfAbsentCount: number;

  constructor(options?: { failPutIfAbsentCount?: number }) {
    this.failPutIfAbsentCount = options?.failPutIfAbsentCount ?? 0;
  }

  async putJsonIfAbsent(key: string, body: unknown): Promise<boolean> {
    if (this.failPutIfAbsentCount > 0) {
      this.failPutIfAbsentCount -= 1;
      return false;
    }
    if (this.objects.has(key)) {
      return false;
    }
    this.objects.set(key, body);
    return true;
  }

  async putJson(key: string, body: unknown): Promise<void> {
    this.putJsonCalls.push({ key, body });
    this.objects.set(key, body);
  }

  async presignPut(
    key: string,
    contentType: string,
    contentLength: number,
    tagging?: string | null,
  ): Promise<string> {
    this.presignCalls.push({ key, contentType, contentLength, tagging: tagging ?? null });
    return `https://s3.example.com/${key}?content-type=${encodeURIComponent(contentType)}&content-length=${contentLength}`;
  }

  async listUserIndexKeys(ownerSub: string): Promise<ListUserIndexKeysResult> {
    if (this.listResult.keys.length > 0) {
      return this.listResult;
    }
    const prefix = `users/${ownerSub}/`;
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix));
    return { keys, truncated: false };
  }

  async listKeys(prefix: string): Promise<ListKeysResult> {
    this.listKeysCalls.push(prefix);
    if (this.listKeysResult.keys.length > 0 && this.listKeysCalls.length === 1) {
      return this.listKeysResult;
    }
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix));
    return { keys, truncated: false };
  }

  async getJson<T>(key: string): Promise<GetJsonResult<T>> {
    this.getJsonCalls.push(key);
    if (this.invalidJsonKeys.has(key)) {
      return { ok: false, reason: 'invalid_json' };
    }
    if (!this.objects.has(key)) {
      return { ok: false, reason: 'not_found' };
    }
    return { ok: true, data: this.objects.get(key) as T };
  }

  async exists(key: string): Promise<boolean> {
    return this.objects.has(key);
  }

  async deleteObjects(keys: string[]): Promise<void> {
    for (const key of keys) {
      if (this.failDeleteKeys.has(key)) {
        throw new Error(`delete failed: ${key}`);
      }
    }
    this.deleteCalls.push([...keys]);
    for (const key of keys) {
      this.objects.delete(key);
      this.tags.delete(key);
    }
  }

  async setObjectTags(key: string, tags: Record<string, string>): Promise<void> {
    this.setObjectTagsCalls.push({ key, tags: { ...tags } });
    if (Object.keys(tags).length === 0) {
      this.tags.delete(key);
      return;
    }
    this.tags.set(key, { ...tags });
  }
}
