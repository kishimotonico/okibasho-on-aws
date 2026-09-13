// 状態セレクタ helper。gallery.html の body[data-state] と .stage:hover に対応する
export const H = (s) => `body[data-state="hover"] ${s}, body[data-state="idle"] .stage:hover ${s}`;
export const D = (s) => `body[data-state="drag"] ${s}`;
export const U = (s) => `body[data-state="uploading"] ${s}`;
export const S = (s) => `body[data-state="success"] ${s}`;
