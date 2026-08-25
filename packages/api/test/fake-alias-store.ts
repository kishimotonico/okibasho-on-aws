import type { PageAliasValue } from '@page-share/shared';

export class FakeAliasStore {
  readonly entries = new Map<string, PageAliasValue>();
  readonly putCalls: Array<{ key: string; value: PageAliasValue; order: number }> = [];
  readonly deleteCalls: string[] = [];
  private callOrder = 0;
  failPut = false;
  failDelete = false;

  async put(key: string, value: PageAliasValue): Promise<void> {
    if (this.failPut) {
      throw new Error('alias put failed');
    }
    this.callOrder += 1;
    this.putCalls.push({ key, value, order: this.callOrder });
    this.entries.set(key, value);
  }

  async delete(key: string): Promise<void> {
    if (this.failDelete) {
      throw new Error('alias delete failed');
    }
    this.deleteCalls.push(key);
    this.entries.delete(key);
  }
}
