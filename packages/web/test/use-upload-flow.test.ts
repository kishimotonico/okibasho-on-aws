// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ListedPage } from '~/api/pages';
import { useUploadFlow, type UploadFlowOptions } from '~/hooks/useUploadFlow';

const upload = vi.fn();

vi.mock('~/hooks/usePagesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/hooks/usePagesApi')>();
  return {
    ...actual,
    usePagesApi: () => ({
      upload: (input: unknown) => upload(input),
      remove: vi.fn(),
      setRetention: vi.fn(),
      viewUrl: (slug: string) => `https://pages.example.com/tanaka/${slug}/`,
      urlOrigin: 'https://pages.example.com',
      userPath: '/tanaka/',
    }),
  };
});

function listedPage(slug: string): ListedPage {
  return {
    slug,
    owner: 'tanaka@example.jp',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: null,
    retention: 'permanent',
    viewUrl: `https://pages.example.com/tanaka/${slug}/`,
  };
}

/** jsdom の File には webkitRelativePath が無いので、ブラウザと同じ形に揃える */
function pickedFile(name: string, content: string, type: string) {
  const file = new File([content], name, { type });
  Object.defineProperty(file, 'webkitRelativePath', { value: '' });
  return file;
}

function htmlFile(name = 'index.html') {
  return pickedFile(name, '<html></html>', 'text/html');
}

function setup(options: Partial<UploadFlowOptions> = {}) {
  const onSlugChange = vi.fn();
  const onUploaded = vi.fn();
  const view = renderHook(() =>
    useUploadFlow({
      pages: [],
      slug: 'my-page',
      retention: 'temporary',
      onSlugChange,
      onUploaded,
      ...options,
    }),
  );
  return { ...view, onSlugChange, onUploaded };
}

describe('useUploadFlow', () => {
  beforeEach(() => {
    upload.mockReset();
    upload.mockResolvedValue({
      slug: 'my-page',
      viewUrl: 'https://pages.example.com/tanaka/my-page/',
    });
  });

  it('一覧にない slug なら確認なしで公開し、成功の状態になる', async () => {
    const { result, onUploaded } = setup();

    act(() => result.current.submitFiles([htmlFile()]));

    await waitFor(() => expect(result.current.state.kind).toBe('success'));
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'my-page', retention: 'temporary', existing: null }),
    );
    expect(onUploaded).toHaveBeenCalledWith('my-page');
    expect(result.current.bubble).toEqual({
      kind: 'success',
      message: '公開しました',
      persist: false,
    });
  });

  it('一覧にある slug なら確認に入り、差し替えるまで公開しない', async () => {
    const { result } = setup({ pages: [listedPage('my-page')] });

    act(() => result.current.submitFiles([htmlFile()]));

    await waitFor(() => expect(result.current.state.kind).toBe('confirming'));
    expect(upload).not.toHaveBeenCalled();
    expect(result.current.bubble?.kind).toBe('confirm');

    act(() => result.current.replace());

    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    // 差し替えでは作成日時と保存期限を一覧の行から引き継ぐ
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        existing: expect.objectContaining({ slug: 'my-page', expiresAt: null }),
      }),
    );
  });

  it('確認中・アップロード中・成功のあいだは次のドロップを受け付けない', async () => {
    const { result } = setup({ pages: [listedPage('my-page')] });
    expect(result.current.accepts).toBe(true);

    act(() => result.current.submitFiles([htmlFile()]));
    await waitFor(() => expect(result.current.state.kind).toBe('confirming'));
    expect(result.current.accepts).toBe(false);

    act(() => result.current.submitFiles([htmlFile()]));
    expect(result.current.state.kind).toBe('confirming');

    act(() => result.current.replace());
    await waitFor(() => expect(result.current.state.kind).toBe('success'));
    expect(result.current.accepts).toBe(false);
  });

  it('index.html がなければエラーの状態になり、失敗しても次を受け付ける', async () => {
    const { result } = setup();

    // 単体の HTML は index.html として公開されるので、複数ファイルで確かめる
    act(() =>
      result.current.submitFiles([
        htmlFile('about.html'),
        pickedFile('style.css', 'body{}', 'text/css'),
      ]),
    );

    await waitFor(() => expect(result.current.state.kind).toBe('error'));
    expect(result.current.bubble).toEqual({
      kind: 'error',
      message: 'index.html がありません',
      persist: false,
    });
    expect(upload).not.toHaveBeenCalled();
    expect(result.current.accepts).toBe(true);
  });

  it('ドロップしたファイルを読めなくてもエラーの状態に落ち、次のドロップを受け付ける', async () => {
    const { result } = setup();
    const unreadable = {
      get items(): never {
        throw new Error('読めません');
      },
    } as unknown as DataTransfer;

    act(() => result.current.submitDataTransfer(unreadable));

    await waitFor(() => expect(result.current.state.kind).toBe('error'));
    expect(result.current.bubble?.message).toBe('送れませんでした。もう一度どうぞ。');
    expect(result.current.accepts).toBe(true);
  });

  it('不正な slug を打っている間はエラーを出したままにし、直すと引っ込める', () => {
    const { result } = setup();

    act(() => result.current.slugChanged('ABC'));
    expect(result.current.bubble).toEqual({
      kind: 'error',
      message: '使えるのは小文字の英数字と - _ だけ',
      persist: true,
    });

    act(() => result.current.slugChanged('abc'));
    expect(result.current.bubble).toBeNull();
    expect(result.current.state.kind).toBe('idle');
  });

  it('吹き出しを閉じても公開できたことは残る', async () => {
    const { result } = setup();

    act(() => result.current.submitFiles([htmlFile()]));
    await waitFor(() => expect(result.current.state.kind).toBe('success'));

    act(() => result.current.dismissNotice());

    expect(result.current.bubble).toBeNull();
    expect(result.current.state.kind).toBe('success');
  });
});
