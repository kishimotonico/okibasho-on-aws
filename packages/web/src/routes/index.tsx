import { isValidSlug } from '@cli/page';
import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useRef } from 'react';

import { useAuth } from '~/auth/auth-context';
import { MyPagesList, type MyPagesListHandle } from '~/components/MyPagesList';
import {
  UploadPanel,
  type UploadPanelHandle,
  type UploadedPageInfo,
} from '~/components/UploadPanel';

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): { slug?: string } => ({
    slug: typeof search.slug === 'string' && isValidSlug(search.slug) ? search.slug : undefined,
  }),
  component: HomePage,
});

function HomePage() {
  const auth = useAuth();
  const { slug } = Route.useSearch();
  const uploadPanelRef = useRef<UploadPanelHandle>(null);
  const myPagesListRef = useRef<MyPagesListHandle>(null);
  const uploadSectionRef = useRef<HTMLDivElement>(null);

  const handleReupload = useCallback((targetSlug: string) => {
    uploadPanelRef.current?.setSlug(targetSlug);
    uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleUploaded = useCallback((info: UploadedPageInfo) => {
    myPagesListRef.current?.highlight(info.slug);
    void myPagesListRef.current?.reload();
  }, []);

  const handleDeleted = useCallback(() => {
    void myPagesListRef.current?.reload();
  }, []);

  if (auth.isLoading) {
    return (
      <div className="page">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (!auth.idToken || !auth.email) {
    return null;
  }

  return (
    <div className="page">
      <div ref={uploadSectionRef} className="upload-section">
        <UploadPanel
          ref={uploadPanelRef}
          initialSlug={slug}
          onUploaded={handleUploaded}
          onDeleted={handleDeleted}
        />
      </div>

      <section className="pages-section" aria-labelledby="uploaded-pages-heading">
        <h2 id="uploaded-pages-heading">アップロード済みページ</h2>
        <MyPagesList ref={myPagesListRef} onReupload={handleReupload} />
      </section>
    </div>
  );
}
