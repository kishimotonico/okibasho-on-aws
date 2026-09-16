import type { CdkCustomResourceEvent } from 'aws-lambda';
import { describe, expect, it, vi } from 'vitest';
import {
  createHandler,
  generateRsaKeyPair,
  type KeyPairParameters,
} from '../lib/lambda/signing-key-pair/handler.js';

const GEN1 = '/Okibasho/pages-signing/1';
const GEN2 = '/Okibasho/pages-signing/2';

function notFound(): Error {
  return Object.assign(new Error('not found'), { name: 'ParameterNotFound' });
}

function fakeParameters(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const parameters: KeyPairParameters = {
    put: vi.fn(async (name: string, value: string) => {
      if (store.has(name)) {
        throw Object.assign(new Error('exists'), { name: 'ParameterAlreadyExists' });
      }
      store.set(name, value);
    }),
    get: vi.fn(async (name: string) => {
      const value = store.get(name);
      if (value === undefined) {
        throw notFound();
      }
      return value;
    }),
    delete: vi.fn(async (name: string) => {
      if (!store.delete(name)) {
        throw notFound();
      }
    }),
  };
  return { store, parameters };
}

function existingGeneration(prefix: string, label: string) {
  return {
    [`${prefix}/public-key`]: `public-${label}`,
    [`${prefix}/private-key`]: `private-${label}`,
  };
}

function event(fields: Record<string, unknown>): CdkCustomResourceEvent {
  return fields as unknown as CdkCustomResourceEvent;
}

let generated = 0;
const fakeGenerate = () => {
  generated += 1;
  return { publicKeyPem: `public-new${generated}`, privateKeyPem: `private-new${generated}` };
};

describe('signing-key-pair', () => {
  it('Create で鍵ペアを SSM に置き、公開鍵だけを返す', async () => {
    const { store, parameters } = fakeParameters();
    const handler = createHandler(parameters, fakeGenerate);

    const result = await handler(
      event({ RequestType: 'Create', ResourceProperties: { ParameterPrefix: GEN1 } }),
    );

    expect(result.PhysicalResourceId).toBe(GEN1);
    expect(result.Data).toEqual({ PublicKeyPem: store.get(`${GEN1}/public-key`) });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(parameters.put).toHaveBeenCalledWith(`${GEN1}/private-key`, expect.any(String), true);
    expect(parameters.put).toHaveBeenCalledWith(`${GEN1}/public-key`, expect.any(String), false);
  });

  it('Create の再試行などでパラメータが残っていれば、作り直さずその公開鍵を返す', async () => {
    const { parameters } = fakeParameters(existingGeneration(GEN1, 'gen1'));
    const handler = createHandler(parameters, fakeGenerate);

    const result = await handler(
      event({ RequestType: 'Create', ResourceProperties: { ParameterPrefix: GEN1 } }),
    );

    expect(result).toEqual({ PhysicalResourceId: GEN1, Data: { PublicKeyPem: 'public-gen1' } });
    expect(parameters.put).not.toHaveBeenCalled();
  });

  it('Update で generation が同じなら置いてある公開鍵を返す', async () => {
    const { parameters } = fakeParameters(existingGeneration(GEN1, 'gen1'));
    const handler = createHandler(parameters, fakeGenerate);

    const result = await handler(
      event({
        RequestType: 'Update',
        PhysicalResourceId: GEN1,
        ResourceProperties: { ParameterPrefix: GEN1 },
        OldResourceProperties: { ParameterPrefix: GEN1 },
      }),
    );

    expect(result).toEqual({ PhysicalResourceId: GEN1, Data: { PublicKeyPem: 'public-gen1' } });
    expect(parameters.put).not.toHaveBeenCalled();
  });

  it('Update で generation が進んだら新しいプレフィックスに作り、旧 generation には触らない', async () => {
    const { store, parameters } = fakeParameters(existingGeneration(GEN1, 'gen1'));
    const handler = createHandler(parameters, fakeGenerate);

    const result = await handler(
      event({
        RequestType: 'Update',
        PhysicalResourceId: GEN1,
        ResourceProperties: { ParameterPrefix: GEN2 },
        OldResourceProperties: { ParameterPrefix: GEN1 },
      }),
    );

    expect(result.PhysicalResourceId).toBe(GEN2);
    expect(store.get(`${GEN2}/public-key`)).toBe(result.Data?.['PublicKeyPem']);
    expect(store.get(`${GEN1}/public-key`)).toBe('public-gen1');
    expect(parameters.delete).not.toHaveBeenCalled();
  });

  it('ロールバックで旧 generation に戻る Update は、残っている旧い鍵をそのまま返す', async () => {
    const { parameters } = fakeParameters({
      ...existingGeneration(GEN1, 'gen1'),
      ...existingGeneration(GEN2, 'gen2'),
    });
    const handler = createHandler(parameters, fakeGenerate);

    const result = await handler(
      event({
        RequestType: 'Update',
        PhysicalResourceId: GEN2,
        ResourceProperties: { ParameterPrefix: GEN1 },
        OldResourceProperties: { ParameterPrefix: GEN2 },
      }),
    );

    expect(result).toEqual({ PhysicalResourceId: GEN1, Data: { PublicKeyPem: 'public-gen1' } });
    expect(parameters.put).not.toHaveBeenCalled();
  });

  it('Delete はその PhysicalResourceId の 2 つだけを消し、無くても成功する', async () => {
    const { store, parameters } = fakeParameters({
      [`${GEN1}/public-key`]: 'public-gen1',
      ...existingGeneration(GEN2, 'gen2'),
    });
    const handler = createHandler(parameters, fakeGenerate);

    const result = await handler(
      event({
        RequestType: 'Delete',
        PhysicalResourceId: GEN1,
        ResourceProperties: { ParameterPrefix: GEN2 },
      }),
    );

    expect(result.PhysicalResourceId).toBe(GEN1);
    expect([...store.keys()].sort()).toEqual([`${GEN2}/private-key`, `${GEN2}/public-key`]);
  });

  it('Delete で ParameterNotFound 以外の失敗はそのまま投げる', async () => {
    const { parameters } = fakeParameters();
    parameters.delete = vi.fn(async () => {
      throw Object.assign(new Error('denied'), { name: 'AccessDeniedException' });
    });
    const handler = createHandler(parameters, fakeGenerate);

    await expect(
      handler(event({ RequestType: 'Delete', PhysicalResourceId: GEN1, ResourceProperties: {} })),
    ).rejects.toThrow('denied');
  });

  it('本物の鍵生成は RSA の PEM（spki / pkcs8）を返す', () => {
    const keyPair = generateRsaKeyPair();

    expect(keyPair.publicKeyPem).toMatch(/^-----BEGIN PUBLIC KEY-----/);
    expect(keyPair.privateKeyPem).toMatch(/^-----BEGIN PRIVATE KEY-----/);
  });
});
