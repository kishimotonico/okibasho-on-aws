/** 本物（~/lib/query-persistence）と同じ export を、同じ型で用意する */
type QueryPersistenceModule = typeof import('~/lib/query-persistence');

// ページはメモリにありリロードで消えるので、一覧のキャッシュも保存しない
export const pagesRestored: QueryPersistenceModule['pagesRestored'] = Promise.resolve();

// 保存していないので消すものも無い。/logout の loader が呼ぶので置く
export const clearPersistedPages: QueryPersistenceModule['clearPersistedPages'] = async () => {};
