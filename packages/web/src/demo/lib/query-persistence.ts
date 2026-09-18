/** 本物（~/lib/query-persistence）と同じ export を、同じ型で用意する */
type QueryPersistenceModule = typeof import('~/lib/query-persistence');

// ページはメモリにありリロードで消えるので、一覧のキャッシュも保存しない
export const pagesRestored: QueryPersistenceModule['pagesRestored'] = Promise.resolve();
