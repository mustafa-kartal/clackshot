import React from 'react';
import { createRoot } from 'react-dom/client';
import { FaceCam } from './FaceCam';

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <FaceCam />
  </React.StrictMode>,
);
