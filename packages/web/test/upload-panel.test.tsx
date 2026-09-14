// @vitest-environment jsdom

import { render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UploadPanel } from '~/components/UploadPanel';
import { TooltipProvider } from '~/components/Tooltip';

const generateRandomSlug = vi.fn();
const getPageMetadata = vi.fn();
const uploadPage = vi.fn();
const deletePage = vi.fn();

vi.mock('@cli/page', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cli/page')>();
  return {
    ...actual,
    generateRandomSlug: () => generateRandomSlug(),
  };
});

vi.mock('~/auth/auth-context', () => ({
  useAuth: () => ({
    email: 'tanaka@example.jp',
    idToken: 'id-token',
    isAuthenticated: true,
    isLoading: false,
  }),
}));

vi.mock('~/config/env', () => ({
  getWebConfig: () => ({
    hostedUiBaseUrl: 'https://auth.example.com',
    oidcIssuer: 'https://issuer.example.com',
    webAppClientId: 'client',
    identityPoolId: 'id-pool',
    userPoolId: 'user-pool',
    region: 'ap-northeast-1',
    pagesBucket: 'pages-bucket',
    pagesBaseUrl: 'https://pages.example.com',
  }),
}));

vi.mock('~/lib/s3-client', () => ({
  createPagesS3Client: vi.fn(() => ({})),
}));

vi.mock('~/lib/pages-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/pages-s3')>();
  return {
    ...actual,
    getPageMetadata: (...args: unknown[]) => getPageMetadata(...args),
    uploadPage: (...args: unknown[]) => uploadPage(...args),
    deletePage: (...args: unknown[]) => deletePage(...args),
  };
});

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
function renderPanel(ui: ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

describe('UploadPanel', () => {
  beforeEach(() => {
    generateRandomSlug.mockReset();
    generateRandomSlug.mockReturnValueOnce('1111111111').mockReturnValue('2222222222');
    getPageMetadata.mockReset();
    uploadPage.mockReset();
    deletePage.mockReset();
  });

  it('初期表示から slug が 10 文字入っている', () => {
    renderPanel(<UploadPanel onUploaded={vi.fn()} />);
    expect(screen.getByText('okibasho')).toBeInTheDocument();
    expect(slugInput()).toHaveValue('1111111111');
  });

  it('CTA と選択ボタンがなく、ファイルを選ぶ・フォルダを選ぶリンクがある', () => {
    renderPanel(<UploadPanel onUploaded={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'アップロード' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'ファイルを選択' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'フォルダを選択' })).toBeNull();
    expect(screen.getByRole('button', { name: 'ファイルを選ぶ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'フォルダを選ぶ' })).toBeInTheDocument();
    expect(screen.getByText('ここにドロップして公開')).toBeInTheDocument();
    expect(screen.getByText('保存期間')).toBeInTheDocument();
  });

  it('ファイル選択だけで uploadPage が走る', async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    getPageMetadata.mockResolvedValue(null);
    uploadPage.mockResolvedValue({});

    renderPanel(<UploadPanel onUploaded={onUploaded} />);

    await user.clear(slugInput());
    await user.type(slugInput(), 'q3-report');
    await user.upload(fileInput(), htmlFile());

    await waitFor(() => expect(uploadPage).toHaveBeenCalledOnce());
    expect(onUploaded).toHaveBeenCalledWith({
      slug: 'q3-report',
      viewUrl: 'https://pages.example.com/tanaka/q3-report/',
      isReupload: false,
    });
  });

  it('新規で既存 slug なら吹き出しが出て、差し替えるまで uploadPage を呼ばない', async () => {
    const user = userEvent.setup();
    getPageMetadata.mockResolvedValue({
      slug: 'taken-slug',
      owner: 'tanaka@example.jp',
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: null,
    });

    renderPanel(<UploadPanel onUploaded={vi.fn()} />);

    await user.clear(slugInput());
    await user.type(slugInput(), 'taken-slug');
    await user.upload(fileInput(), htmlFile());

    expect(
      screen.getByText('taken-slug はもうあるよ。差し替える？ 保存期間はそのまま'),
    ).toBeInTheDocument();
    expect(uploadPage).not.toHaveBeenCalled();

    uploadPage.mockResolvedValue({});
    await user.click(screen.getByRole('button', { name: '差し替える' }));

    await waitFor(() => expect(uploadPage).toHaveBeenCalledOnce());
  });

  it('HTML 以外は吹き出しで HTML 以外は置けません', async () => {
    const user = userEvent.setup();
    renderPanel(<UploadPanel onUploaded={vi.fn()} />);

    await user.upload(fileInput(), new File(['x'], 'notes.txt', { type: 'text/plain' }));

    expect(screen.getByText('HTML 以外は置けません')).toBeInTheDocument();
    expect(uploadPage).not.toHaveBeenCalled();
  });

  it('ネットワークエラーは吹き出しに出す', async () => {
    const user = userEvent.setup();
    getPageMetadata.mockResolvedValue(null);
    uploadPage.mockRejectedValue(new TypeError('Failed to fetch'));

    renderPanel(<UploadPanel onUploaded={vi.fn()} />);
    await user.upload(fileInput(), htmlFile());

    await waitFor(() =>
      expect(
        screen.getByText('つながりません。接続を確かめて、もう一度どうぞ。'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });

  it('getPageMetadata が reject しても lock が外れ、再選択で upload できる', async () => {
    const user = userEvent.setup();
    getPageMetadata.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    getPageMetadata.mockResolvedValue(null);
    uploadPage.mockResolvedValue({});

    renderPanel(<UploadPanel onUploaded={vi.fn()} />);
    await user.upload(fileInput(), htmlFile());

    await waitFor(() =>
      expect(
        screen.getByText('つながりません。接続を確かめて、もう一度どうぞ。'),
      ).toBeInTheDocument(),
    );
    expect(uploadPage).not.toHaveBeenCalled();

    await user.upload(fileInput(), htmlFile());

    await waitFor(() => expect(uploadPage).toHaveBeenCalledOnce());
  });

  it('成功後は結果だけが残り、フォームは隠れる', async () => {
    const user = userEvent.setup();
    getPageMetadata.mockResolvedValue(null);
    uploadPage.mockResolvedValue({});

    renderPanel(<UploadPanel onUploaded={vi.fn()} />);

    await user.upload(fileInput(), htmlFile());

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'https://pages.example.com/tanaka/1111111111/' }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('textbox', { name: /公開URL/ })).toBeNull();
    expect(screen.getByRole('button', { name: '次のファイルを置く' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '次のファイルを置く' }));

    expect(slugInput()).toHaveValue('2222222222');
    expect(screen.getByRole('button', { name: 'ファイルを選ぶ' })).toBeInTheDocument();
  });

  it('メタデータ確認中は2回目の選択を無視する', async () => {
    const user = userEvent.setup();
    let resolveMetadata: ((value: null) => void) | undefined;
    getPageMetadata.mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          resolveMetadata = resolve;
        }),
    );
    uploadPage.mockResolvedValue({});

    renderPanel(<UploadPanel onUploaded={vi.fn()} />);

    await user.upload(fileInput(), htmlFile());
    expect(getPageMetadata).toHaveBeenCalledTimes(1);
    expect(uploadPage).not.toHaveBeenCalled();

    await user.upload(fileInput(), htmlFile());
    expect(getPageMetadata).toHaveBeenCalledTimes(1);
    expect(uploadPage).not.toHaveBeenCalled();

    resolveMetadata!(null);
    await waitFor(() => expect(uploadPage).toHaveBeenCalledOnce());
  });

  it('slug が空なら generateRandomSlug で uploadPage する', async () => {
    const user = userEvent.setup();
    getPageMetadata.mockResolvedValue(null);
    uploadPage.mockResolvedValue({});

    renderPanel(<UploadPanel onUploaded={vi.fn()} />);
    await user.clear(slugInput());
    await user.upload(fileInput(), htmlFile());

    await waitFor(() => expect(uploadPage).toHaveBeenCalledOnce());
    expect(uploadPage).toHaveBeenCalledWith(
      expect.anything(),
      'pages-bucket',
      'tanaka@example.jp',
      '2222222222',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('不正 slug では吹き出しを出して uploadPage しない', async () => {
    const user = userEvent.setup();
    renderPanel(<UploadPanel onUploaded={vi.fn()} />);

    await user.clear(slugInput());
    await user.type(slugInput(), 'ABC');
    await user.upload(fileInput(), htmlFile());

    expect(screen.getByText('使えるのは小文字の英数字と - _ だけ')).toBeInTheDocument();
    expect(uploadPage).not.toHaveBeenCalled();
  });

  it('既存 slug の確認中に slug を変えて HTML を選ぶと新しい slug で upload する', async () => {
    const user = userEvent.setup();
    getPageMetadata.mockResolvedValue({
      slug: 'taken-slug',
      owner: 'tanaka@example.jp',
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: null,
    });
    uploadPage.mockResolvedValue({});

    renderPanel(<UploadPanel onUploaded={vi.fn()} />);

    await user.clear(slugInput());
    await user.type(slugInput(), 'taken-slug');
    await user.upload(fileInput(), htmlFile());

    expect(
      screen.getByText('taken-slug はもうあるよ。差し替える？ 保存期間はそのまま'),
    ).toBeInTheDocument();
    expect(uploadPage).not.toHaveBeenCalled();

    getPageMetadata.mockResolvedValue(null);
    await user.type(slugInput(), 'taken-slug2');

    expect(
      screen.queryByText('taken-slug はもうあるよ。差し替える？ 保存期間はそのまま'),
    ).toBeNull();

    await user.upload(fileInput(), htmlFile());

    await waitFor(() => expect(getPageMetadata).toHaveBeenCalledTimes(2));
    expect(getPageMetadata).toHaveBeenLastCalledWith(
      expect.anything(),
      'pages-bucket',
      'tanaka@example.jp',
      'taken-slug2',
    );
    await waitFor(() => expect(uploadPage).toHaveBeenCalledOnce());
    expect(uploadPage).toHaveBeenCalledWith(
      expect.anything(),
      'pages-bucket',
      'tanaka@example.jp',
      'taken-slug2',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('HTML 以外のあと HTML を選ぶと吹き出しが消え uploadPage する', async () => {
    const user = userEvent.setup();
    getPageMetadata.mockResolvedValue(null);
    uploadPage.mockResolvedValue({});

    renderPanel(<UploadPanel onUploaded={vi.fn()} />);
    await user.upload(fileInput(), new File(['x'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByText('HTML 以外は置けません')).toBeInTheDocument();

    await user.upload(fileInput(), htmlFile());
    expect(screen.queryByText('HTML 以外は置けません')).toBeNull();
    await waitFor(() => expect(uploadPage).toHaveBeenCalledOnce());
  });
});
