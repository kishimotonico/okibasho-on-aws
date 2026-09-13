import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { UploadBoxIconHarness } from './upload-box-icon-harness';

const root = document.getElementById('root');
if (!root) {
  throw new Error('root が無い');
}

createRoot(root).render(
  <StrictMode>
    <UploadBoxIconHarness />
  </StrictMode>,
);
