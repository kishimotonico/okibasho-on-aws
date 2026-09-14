// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { UrlField } from '~/components/UrlField';
import { TooltipProvider } from '~/components/Tooltip';

const url = 'https://pages.example.com/s/abcdefghijklmnopqrstuv/';

describe('UrlField', () => {
  it('URL を新しいタブで開くリンクとして表示する', () => {
    render(
      <TooltipProvider>
        <UrlField url={url} />
      </TooltipProvider>,
    );

    const link = screen.getByRole('link', { name: url });
    expect(link).toHaveAttribute('href', url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('コピーボタンでクリップボードに書き込み、成功表示に切り替わる', async () => {
    // userEvent.setup() は自前のクリップボードスタブを差し込むため、
    // 上書きするならその後で行う（先に上書きすると setup() 側で消される）
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(
      <TooltipProvider>
        <UrlField url={url} />
      </TooltipProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'URLをコピー' }));

    expect(writeText).toHaveBeenCalledWith(url);
    expect(await screen.findByRole('button', { name: 'コピーしました' })).toBeInTheDocument();
  });

  it('末尾の記号を含めて文字順が保たれるよう、テキストを dir="ltr" の span で独立させる', () => {
    render(
      <TooltipProvider>
        <UrlField url={url} />
      </TooltipProvider>,
    );

    const link = screen.getByRole('link', { name: url });
    const textSpan = link.querySelector('span');
    expect(textSpan).toHaveAttribute('dir', 'ltr');
    expect(textSpan).toHaveTextContent(url);
    expect(url.endsWith('/')).toBe(true);
  });

  it('短い URL（省略なし）でも同じ構造で表示する', () => {
    const shortUrl = 'https://pages.example.com/s/abc/';

    render(
      <TooltipProvider>
        <UrlField url={shortUrl} />
      </TooltipProvider>,
    );

    expect(screen.getByRole('link', { name: shortUrl })).toHaveAttribute('href', shortUrl);
  });

  it('label を渡すと field-label として表示する', () => {
    render(
      <TooltipProvider>
        <UrlField url={url} label="共有URL" />
      </TooltipProvider>,
    );

    expect(screen.getByText('共有URL')).toBeInTheDocument();
  });
});
