// Splash window mount noktası. Hiç IPC/state'e ihtiyacı yok — saf görsel.
import { createRoot } from 'react-dom/client';
import { Splash } from './Splash';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Splash />);
}
