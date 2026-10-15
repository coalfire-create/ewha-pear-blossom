import { createRoot } from 'react-dom/client';
import Lenis from 'lenis';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

const lenis = new Lenis({ lerp: 0.08 });
const raf = (t: number) => { lenis.raf(t); requestAnimationFrame(raf); };
requestAnimationFrame(raf);
document.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest('a[href^="#"]');
  if (!a) return;
  e.preventDefault();
  lenis.scrollTo(a.getAttribute('href')!, { duration: 1.8 });
});
