import type {
  GetJsonResult,
  ListKeysResult,
  ListObjectInfosResult,
  ListUserIndexKeysResult,
  PageStore,
} from '../src/page-store.js';

export class FakePageStore implements PageStore {
  readonly objects = new Map<string, unknown>();
  readonly tags = new Map<string, Record<string, string>>();
  readonly lastModified = new Map<string, Date>();
  readonly invalidJsonKeys = new Set<string>();
  readonly deleteCalls: string[][] = [];
  readonly putJsonCalls: Array<{ key: string; body: unknown; order: number }> = [];
  readonly putJsonIfAbsentCalls: Array<{ key: string; body: unknown; order: number }> = [];
  readonly setObjectTagsCalls: Array<{ key: string; tags: Record<string, string> }> = [];
  readonly failDeleteKeys = new Set<string>();
  listResult: ListUserIndexKeysResult = { keys: [], truncated: false };
  listKeysResult: ListKeysResult = { keys: [], truncated: false };
  listObjectInfosResult: ListObjectInfosResult = { objects: [], truncated: false };
  listKeysCalls: string[] = [];
  getJsonCalls: string[] = [];
  readonly presignCalls: Array<{
    key: string;
    contentType: string;
    contentLength: number;
    tagging?: string | null;
  }> = [];
  private failPutIfAbsentCount: number;
  private callOrder = 0;

  constructor(options?: { failPutIfAbsentCount?: number }) {
    this.failPutIfAbsentCount = options?.failPutIfAbsentCount ?? 0;
  }

  seedObject(key: string, lastModified: Date = new Date()): void {
    this.objects.set(key, {});
    this.lastModified.set(key, lastModified);
  }

  async putJsonIfAbsent(key: string, body: unknown): Promise<boolean> {
    if (this.failPutIfAbsentCount > 0) {
      this.failPutIfAbsentCount -= 1;
      return false;
    }
    if (this.objects.has(key)) {
      return false;
    }
    this.callOrder += 1;
    this.putJsonIfAbsentCalls.push({ key, body, order: this.callOrder });
    this.objects.set(key, body);
    this.lastModified.set(key, new Date());
    return true;
  }

  async putJson(key: string, body: unknown): Promise<void> {
    this.callOrder += 1;
    this.putJsonCalls.push({ key, body, order: this.callOrder });
    this.objects.set(key, body);
    this.lastModified.set(key, new Date());
  }

  async presignPut(
    key: string,
    contentType: string,
    contentLength: number,
    tagging?: string | null,
  ): Promise<string> {
    this.presignCalls.push({ key, contentType, contentLength, tagging });
    return `https://example.com/${encodeURIComponent(key)}`;
  }

  async listUserIndexKeys(ownerSub: string): Promise<ListUserIndexKeysResult> {
    const prefix = `users/${ownerSub}/`;
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix));
    return this.listResult.keys.length > 0
      ? this.listResult
      : { keys, truncated: false };
  }

  async listKeys(prefix: string): Promise<ListKeysResult> {
    this.listKeysCalls.push(prefix);
    if (this.listKeysResult.keys.length > 0) {
      return this.listKeysResult;
    }
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix));
    return { keys, truncated: false };
  }

  async listObjectInfos(prefix: string): Promise<ListObjectInfosResult> {
    if (this.listObjectInfosResult.objects.length > 0) {
      return this.listObjectInfosResult;
    }
    const objects = [...this.objects.keys()]
      .filter((key) => key.startsWith(prefix))
      .map((key) => ({
        key,
        lastModified: this.lastModified.get(key) ?? new Date(0),
      }));
    return { objects, truncated: false };
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

  async getObjectTags(key: string): Promise<Record<string, string>> {
    return this.tags.get(key) ?? {};
  }

  async deleteObjects(keys: string[]): Promise<void> {
    this.deleteCalls.push(keys);
    for (const key of keys) {
      if (this.failDeleteKeys.has(key)) {
        throw new Error(`delete failed: ${key}`);
      }
      this.objects.delete(key);
      this.tags.delete(key);
      this.lastModified.delete(key);
    }
  }

  async setObjectTags(key: string, tags: Record<string, string>): Promise<void> {
    this.setObjectTagsCalls.push({ key, tags });
    if (Object.keys(tags).length === 0) {
      this.tags.delete(key);
      return;
    }
    this.tags.set(key, tags);
  }
}
