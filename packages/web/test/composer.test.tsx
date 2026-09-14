// @vitest-environment jsdom

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Composer } from '~/components/Composer';
import { TooltipProvider } from '~/components/Tooltip';
import { PagesApiError } from '~/hooks/usePagesApi';
import type { ListedPage } from '~/lib/listed-page';

const generateRandomSlug = vi.fn();
const upload = vi.fn();

vi.mock('@okibasho/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@okibasho/core')>();
  return {
    ...actual,
    generateRandomSlug: () => generateRandomSlug(),
  };
});

vi.mock('~/hooks/usePagesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/hooks/usePagesApi')>();
  return {
    ...actual,
    usePagesApi: () => ({
      upload: (input: unknown) => upload(input),
      remove: vi.fn(),
      setRetention: vi.fn(),
      viewUrl: (slug: string) => `https://pages.example.com/p/tanaka/${slug}/`,
      urlOrigin: 'https://pages.example.com',
      userPath: '/p/tanaka/',
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
    viewUrl: `https://pages.example.com/p/tanaka/${slug}/`,
    shareTag: 'a'.repeat(11),
  };
}

function uploaded(slug: string) {
  return { slug, viewUrl: `https://pages.example.com/p/tanaka/${slug}/` };
}

function htmlFile() {
  return new File(['<html></html>'], 'index.html', { type: 'text/html' });
}

function fileInput() {
  const input = document.querySelector<HTMLInputElement>(
    'input[type="file"]:not([webkitdirectory])',
  );
  if (!input) {
    throw new Error('file input not found');
  }
  return input;
}

function slugInput() {
  return screen.getByRole('textbox', { name: /公開URL/ });
}

function renderComposer(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  const onUploaded = vi.fn();
  const onDelete = vi.fn();
  const onShare = vi.fn();
  const view = render(
    <TooltipProvider>
      <Composer
        pages={[]}
        seed={null}
        retired={null}
        deleting={false}
        onUploaded={onUploaded}
        onDelete={onDelete}
        onShare={onShare}
        {...props}
      />
    </TooltipProvider>,
  );
  return { ...view, onUploaded, onDelete, onShare };
}

describe('Composer', () => {
  beforeEach(() => {
    generateRandomSlug.mockReset();
    generateRandomSlug.mockReturnValueOnce('1111111111').mockReturnValue('2222222222');
    upload.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('初期表示から slug が 10 文字入っている', () => {
    renderComposer();

    expect(screen.getByText('okibasho')).toBeInTheDocument();
    expect(slugInput()).toHaveValue('1111111111');
  });

  it('CTA と選択ボタンがなく、ファイルを選ぶ・フォルダを選ぶリンクがある', () => {
    renderComposer();

    expect(screen.queryByRole('button', { name: 'アップロード' })).toBeNull();
    expect(screen.getByRole('button', { name: 'ファイルを選ぶ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'フォルダを選ぶ' })).toBeInTheDocument();
    expect(screen.getByText('ここにドロップして公開')).toBeInTheDocument();
    expect(screen.getByText('保存期間')).toBeInTheDocument();
  });

  it('ファイル選択だけでアップロードが走る', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(uploaded('q3-report'));
    const { onUploaded } = renderComposer();

    await user.clear(slugInput());
    await user.type(slugInput(), 'q3-report');
    await user.upload(fileInput(), htmlFile());

    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'q3-report', retention: 'temporary', existing: null }),
    );
    expect(onUploaded).toHaveBeenCalledWith(uploaded('q3-report'));
  });

  it('一覧にある slug なら吹き出しを出し、差し替えるまでアップロードしない', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(uploaded('taken-slug'));
    renderComposer({ pages: [listedPage('taken-slug')] });

    await user.clear(slugInput());
    await user.type(slugInput(), 'taken-slug');
    await user.upload(fileInput(), htmlFile());

    expect(
      screen.getByText('taken-slug はもうあるよ。差し替える？ 保存期間はそのまま'),
    ).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: '差し替える' }));

    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    // 差し替えでは一覧の行から作成日時と保存期限を引き継ぐ
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'taken-slug',
        existing: expect.objectContaining({
          createdAt: '2026-08-01T00:00:00.000Z',
          expiresAt: null,
        }),
      }),
    );
  });

  it('確認中に slug を変えて選び直すと新しい slug でアップロードする', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(uploaded('taken-slug2'));
    renderComposer({ pages: [listedPage('taken-slug')] });

    await user.clear(slugInput());
    await user.type(slugInput(), 'taken-slug');
    await user.upload(fileInput(), htmlFile());
    expect(
      screen.getByText('taken-slug はもうあるよ。差し替える？ 保存期間はそのまま'),
    ).toBeInTheDocument();

    // フォーカスで全選択されるので、打ち直すと丸ごと差し替わる
    await user.type(slugInput(), 'taken-slug2');
    expect(
      screen.queryByText('taken-slug はもうあるよ。差し替える？ 保存期間はそのまま'),
    ).toBeNull();

    await user.upload(fileInput(), htmlFile());

    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'taken-slug2', existing: null }),
    );
  });

  it('HTML 以外は吹き出しで断り、次に HTML を選べば消えてアップロードする', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(uploaded('1111111111'));
    renderComposer();

    await user.upload(fileInput(), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByText('HTML 以外は置けません')).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();

    await user.upload(fileInput(), htmlFile());
    expect(screen.queryByText('HTML 以外は置けません')).toBeNull();
    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
  });

  it('不正な slug では吹き出しを出してアップロードしない', async () => {
    const user = userEvent.setup();
    renderComposer();

    await user.clear(slugInput());
    await user.type(slugInput(), 'ABC');
    await user.upload(fileInput(), htmlFile());

    expect(screen.getByText('使えるのは小文字の英数字と - _ だけ')).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it('slug が空なら乱数を入れ直してアップロードする', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(uploaded('2222222222'));
    renderComposer();

    await user.clear(slugInput());
    await user.upload(fileInput(), htmlFile());

    await waitFor(() => expect(upload).toHaveBeenCalledOnce());
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({ slug: '2222222222' }));
  });

  it('失敗は吹き出しに出し、生のエラーは見せない', async () => {
    const user = userEvent.setup();
    upload.mockRejectedValue(new PagesApiError('つながりません。接続を確かめて、もう一度どうぞ。'));
    renderComposer();

    await user.upload(fileInput(), htmlFile());

    await waitFor(() =>
      expect(
        screen.getByText('つながりません。接続を確かめて、もう一度どうぞ。'),
      ).toBeInTheDocument(),
    );
  });

  it('アップロード中は2回目の選択を無視する', async () => {
    const user = userEvent.setup();
    let finish: ((value: { slug: string; viewUrl: string }) => void) | undefined;
    upload.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderComposer();

    await user.upload(fileInput(), htmlFile());
    expect(upload).toHaveBeenCalledTimes(1);

    await user.upload(fileInput(), htmlFile());
    expect(upload).toHaveBeenCalledTimes(1);

    finish!(uploaded('1111111111'));
    await screen.findByRole('button', { name: '次のファイルを置く' });
  });

  it('成功後は結果だけが残り、次のファイルを置くでフォームに戻る', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(uploaded('1111111111'));
    renderComposer();

    await user.upload(fileInput(), htmlFile());

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'https://pages.example.com/p/tanaka/1111111111/' }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('textbox', { name: /公開URL/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: '次のファイルを置く' }));

    expect(slugInput()).toHaveValue('2222222222');
    expect(screen.getByRole('button', { name: 'ファイルを選ぶ' })).toBeInTheDocument();
  });

  it('成功結果は UrlField（リンク+コピー）と「外部共有…」を持つ', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(uploaded('1111111111'));
    const { onShare } = renderComposer();

    await user.upload(fileInput(), htmlFile());
    const link = await screen.findByRole('link', {
      name: 'https://pages.example.com/p/tanaka/1111111111/',
    });
    expect(link).toHaveAttribute('target', '_blank');

    await user.click(screen.getByRole('button', { name: 'URLをコピー' }));
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '外部共有…' }));
    expect(onShare).toHaveBeenCalledWith('1111111111');
  });

  it('成功結果の削除は確認してから onDelete を呼ぶ', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(uploaded('1111111111'));
    const { onDelete } = renderComposer();

    await user.upload(fileInput(), htmlFile());
    await screen.findByRole('button', { name: '削除' });

    await user.click(screen.getByRole('button', { name: '削除' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('「1111111111」を削除しますか？');

    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '削除' }));
    expect(onDelete).toHaveBeenCalledWith('1111111111');
  });

  it('一覧の再アップロードは slug を入れてフォーカスし、結果表示を閉じる', async () => {
    const user = userEvent.setup();
    upload.mockResolvedValue(uploaded('1111111111'));
    const { rerender, onUploaded, onDelete, onShare } = renderComposer();

    await user.upload(fileInput(), htmlFile());
    await screen.findByRole('button', { name: '次のファイルを置く' });

    rerender(
      <TooltipProvider>
        <Composer
          pages={[]}
          seed={{ slug: 'from-list', nonce: 1 }}
          retired={null}
          deleting={false}
          onUploaded={onUploaded}
          onDelete={onDelete}
          onShare={onShare}
        />
      </TooltipProvider>,
    );

    expect(slugInput()).toHaveValue('from-list');
    expect(slugInput()).toHaveFocus();
    expect(screen.queryByRole('button', { name: '次のファイルを置く' })).toBeNull();
  });

  it('一覧から消えた slug がフォームに残っていれば乱数に戻す', () => {
    const { rerender, onUploaded, onDelete, onShare } = renderComposer({ initialSlug: 'gone' });
    expect(slugInput()).toHaveValue('gone');

    rerender(
      <TooltipProvider>
        <Composer
          initialSlug="gone"
          pages={[]}
          seed={null}
          retired={{ slug: 'gone', nonce: 1 }}
          deleting={false}
          onUploaded={onUploaded}
          onDelete={onDelete}
          onShare={onShare}
        />
      </TooltipProvider>,
    );

    expect(slugInput()).toHaveValue('1111111111');
  });
});
