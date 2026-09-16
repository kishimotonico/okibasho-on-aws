import type { CdkCustomResourceEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import {
  createHandler,
  generateRsaKeyPair,
  type KeyPairParameters,
} from '../lib/lambda/signing-key-pair/handler.js';

const PREFIX = '/Okibasho/pages-signing';

function fakeParameters(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const parameters: KeyPairParameters = {
    put: vi.fn(async (name: string, value: string) => {
      store.set(name, value);
    }),
    get: vi.fn(async (name: string) => store.get(name)!),
    delete: vi.fn(async (name: string) => {
      if (!store.delete(name)) {
        throw Object.assign(new Error('not found'), { name: 'ParameterNotFound' });
      }
    }),
  };
  return { store, parameters };
}

function event(fields: Record<string, unknown>): CdkCustomResourceEvent {
  return fields as unknown as CdkCustomResourceEvent;
}

let generated = 0;
const fakeGenerate = () => {
  generated += 1;
  return { publicKeyPem: `public-${generated}`, privateKeyPem: `private-${generated}` };
};

describe('signing-key-pair', () => {
  it('Create で鍵ペアを SSM に置き、公開鍵だけを返す', async () => {
    const { store, parameters } = fakeParameters();
    const handler = createHandler(parameters, fakeGenerate);

    const result = await handler(
      event({
        RequestType: 'Create',
        ResourceProperties: { ParameterPrefix: PREFIX, Generation: '1' },
      }),
    );

    expect(result.PhysicalResourceId).toBe(PREFIX);
    expect(result.Data).toEqual({ PublicKeyPem: store.get(`${PREFIX}/public-key`) });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(parameters.put).toHaveBeenCalledWith(`${PREFIX}/private-key`, expect.any(String), true);
    expect(parameters.put).toHaveBeenCalledWith(`${PREFIX}/public-key`, expect.any(String), false);
  });

  it('Update で generation が同じなら作り直さず SSM の公開鍵を返す', async () => {
    const { parameters } = fakeParameters({
      [`${PREFIX}/public-key`]: 'existing-public',
      [`${PREFIX}/private-key`]: 'existing-private',
    });
    const handler = createHandler(parameters, fakeGenerate);
    const props = { ParameterPrefix: PREFIX, Generation: '1' };

    const result = await handler(
      event({
        RequestType: 'Update',
        PhysicalResourceId: PREFIX,
        ResourceProperties: props,
        OldResourceProperties: props,
      }),
    );

    expect(result).toEqual({
      PhysicalResourceId: PREFIX,
      Data: { PublicKeyPem: 'existing-public' },
    });
    expect(parameters.put).not.toHaveBeenCalled();
  });

  it('Update で generation が変わったら作り直す', async () => {
    const { store, parameters } = fakeParameters({ [`${PREFIX}/public-key`]: 'existing-public' });
    const handler = createHandler(parameters, fakeGenerate);

    const result = await handler(
      event({
        RequestType: 'Update',
        PhysicalResourceId: PREFIX,
        ResourceProperties: { ParameterPrefix: PREFIX, Generation: '2' },
        OldResourceProperties: { ParameterPrefix: PREFIX, Generation: '1' },
      }),
    );

    expect(result.Data?.['PublicKeyPem']).not.toBe('existing-public');
    expect(store.get(`${PREFIX}/public-key`)).toBe(result.Data?.['PublicKeyPem']);
  });

  it('Delete で 2 つのパラメータを消し、無くても成功する', async () => {
    const { store, parameters } = fakeParameters({ [`${PREFIX}/public-key`]: 'existing-public' });
    const handler = createHandler(parameters, fakeGenerate);

    const result = await handler(
      event({
        RequestType: 'Delete',
        PhysicalResourceId: PREFIX,
        ResourceProperties: { ParameterPrefix: PREFIX, Generation: '1' },
      }),
    );

    expect(result.PhysicalResourceId).toBe(PREFIX);
    expect(store.size).toBe(0);
  });

  it('Delete で ParameterNotFound 以外の失敗はそのまま投げる', async () => {
    const { parameters } = fakeParameters();
    parameters.delete = vi.fn(async () => {
      throw Object.assign(new Error('denied'), { name: 'AccessDeniedException' });
    });
    const handler = createHandler(parameters, fakeGenerate);

    await expect(
      handler(event({ RequestType: 'Delete', PhysicalResourceId: PREFIX, ResourceProperties: {} })),
    ).rejects.toThrow('denied');
  });

  it('本物の鍵生成は RSA の PEM（spki / pkcs8）を返す', () => {
    const keyPair = generateRsaKeyPair();

    expect(keyPair.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(keyPair.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
  });
});
