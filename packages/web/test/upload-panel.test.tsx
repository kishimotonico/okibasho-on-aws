// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UploadPanel } from '~/components/UploadPanel';

const getPageMetadata = vi.fn();
const uploadPage = vi.fn();

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

describe('UploadPanel', () => {
  beforeEach(() => {
    getPageMetadata.mockReset();
    uploadPage.mockReset();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('composer に箱・ブランド・フォルダ文言・公開URL・保存期間を一塊で出す', () => {
    const onUploaded = vi.fn();
    render(<UploadPanel onUploaded={onUploaded} />);

    expect(screen.getByText('okibasho')).toBeInTheDocument();
    expect(screen.getByText('ファイルまたはフォルダをドロップ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'フォルダを選択' })).toBeInTheDocument();
    expect(screen.queryByText('ディレクトリを選択')).toBeNull();
    expect(screen.queryByText('URL を指定する（任意）')).toBeNull();
    expect(screen.getByText('https://pages.example.com/tanaka/')).toBeInTheDocument();
    expect(screen.getByText('保存期間')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '公開URL' })).toHaveAttribute(
      'placeholder',
      'my-page',
    );
    expect(screen.getByRole('button', { name: 'ファイルを選択' })).toBeInTheDocument();
    expect(screen.queryByLabelText('ファイルを選択')).toBeNull();

    const submit = screen.getByRole('button', { name: 'アップロード' });
    expect(submit).toBeDisabled();
    expect(submit).toBeVisible();
  });

  it('ファイル選択後にアップロードでき、成功結果と onUploaded を渡す', async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    getPageMetadata.mockResolvedValue(null);
    uploadPage.mockResolvedValue({});

    render(<UploadPanel onUploaded={onUploaded} />);

    await user.upload(fileInput(), htmlFile());
    expect(screen.getByText('index.html を選択しました')).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: '公開URL' }), 'q3-report');
    await user.click(screen.getByRole('button', { name: 'アップロード' }));

    expect(uploadPage).toHaveBeenCalledOnce();
    expect(onUploaded).toHaveBeenCalledWith({
      slug: 'q3-report',
      viewUrl: 'https://pages.example.com/tanaka/q3-report/',
      isReupload: false,
    });
    expect(screen.getByText('アップロードしました')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'https://pages.example.com/tanaka/q3-report/' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'URLをコピー' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ページを開く' })).toHaveAttribute(
      'href',
      'https://pages.example.com/tanaka/q3-report/',
    );
    expect(screen.queryByText('index.html を選択しました')).toBeNull();
    expect(screen.getByRole('button', { name: 'アップロード' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: '公開URL' })).toHaveValue('');
  });

  it('再アップロードでは slug が固定で保存期間は出さず、isReupload になる', async () => {
    const user = userEvent.setup();
    const onUploaded = vi.fn();
    getPageMetadata.mockResolvedValue({
      slug: 'keep-me',
      owner: 'tanaka@example.jp',
      createdAt: '2026-08-01T00:00:00.000Z',
      expiresAt: null,
    });
    uploadPage.mockResolvedValue({});

    render(<UploadPanel initialSlug="keep-me" onUploaded={onUploaded} />);

    expect(screen.getByRole('textbox', { name: '公開URL' })).toHaveAttribute('readOnly');
    expect(screen.queryByText('保存期間')).toBeNull();
    expect(screen.getByRole('button', { name: '再アップロード' })).toBeDisabled();

    await user.upload(fileInput(), htmlFile());
    await user.click(screen.getByRole('button', { name: '再アップロード' }));

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(onUploaded).toHaveBeenCalledWith({
      slug: 'keep-me',
      viewUrl: 'https://pages.example.com/tanaka/keep-me/',
      isReupload: true,
    });
    expect(screen.getByRole('textbox', { name: '公開URL' })).toHaveValue('keep-me');
    expect(screen.getByText('アップロードしました')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '再アップロード' })).toBeDisabled();
  });

  it('HTML 以外の単一ファイルは受け付けない', async () => {
    const user = userEvent.setup();
    render(<UploadPanel onUploaded={vi.fn()} />);

    await user.upload(fileInput(), new File(['x'], 'notes.txt', { type: 'text/plain' }));

    expect(
      screen.getByText('単一ファイル選択では HTML ファイルのみアップロードできます'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'アップロード' })).toBeDisabled();
  });

  it('ネットワークエラーは日本語の案内にする', async () => {
    const user = userEvent.setup();
    getPageMetadata.mockResolvedValue(null);
    uploadPage.mockRejectedValue(new TypeError('Failed to fetch'));

    render(<UploadPanel onUploaded={vi.fn()} />);

    await user.upload(fileInput(), htmlFile());
    await user.click(screen.getByRole('button', { name: 'アップロード' }));

    expect(
      screen.getByText(
        'アップロードできませんでした。ネットワーク接続を確認して、もう一度お試しください。',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });
});
