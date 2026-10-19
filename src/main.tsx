import { createRoot } from 'react-dom/client';
import App from './App';
import './scroll';
import './styles.css';

history.scrollRestoration = 'manual';
createRoot(document.getElementById('root')!).render(<App />);
