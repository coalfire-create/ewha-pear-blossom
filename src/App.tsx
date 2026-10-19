import { useEffect, useRef, useState, type ReactNode } from 'react';
import { buildWorld, type World } from './world/world';
import { clockAt, CHAPTERS, type ChapterId } from './world/layout';
import { lenis } from './scroll';

// 이화의 하루 — the whole page is one walk through campus. A fixed 3D world
// fills the screen; scrolling the tall journey moves the camera from the main
// gate at dawn to the night lawn, and story beats fade in over it in step
// with what the camera is looking at.

type Side = 'left' | 'right' | 'center' | 'bottom';
interface Beat { id: string; at: [number, number]; side: Side; body: ReactNode; wide?: boolean }

const STOPS: { id: ChapterId; ko: string; en: string }[] = [
  { id: 'gate', ko: '정문', en: 'Main Gate' },
  { id: 'ecc', ko: 'ECC', en: 'Campus Valley' },
  { id: 'pfeiffer', ko: '파이퍼홀', en: 'Pfeiffer Hall' },
  { id: 'auditorium', ko: '대강당', en: 'Welch-Ryang Auditorium' },
  { id: 'avenue', ko: '배꽃길', en: 'Pear Avenue' },
  { id: 'night', ko: '잔디광장', en: 'The Lawn at Night' },
];

const AI_STEPS: [string, string][] = [
  ['2022', '인공지능전공 신설'],
  ['2023', '인공지능대학 설립'],
  ['2024', '지능형반도체공학전공 신설'],
  ['2025', '인공지능데이터사이언스학부 신설'],
];

function Count({ to, on, suffix = '' }: { to: number; on: boolean; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const t0 = performance.now(), dur = to > 999 ? 1900 : 1300;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / dur);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [on, to]);
  return <>{v}{suffix}</>;
}

const beats = (active: string): Beat[] => [
  {
    id: 'hero', at: [-1, 0.045], side: 'bottom', wide: true, body: (
      <div className="hero">
        <p className="kicker">EWHA WOMANS UNIVERSITY · 1886 — 2026</p>
        <h1>가장 먼저 핀 꽃이<br />가장 멀리 갑니다</h1>
        <p className="hero__sub">새벽의 정문에서 밤의 잔디광장까지.<br />스크롤을 내려 140번째 봄, 이화의 하루를 걸어 보세요.</p>
        <span className="hero__cue"><i />Scroll to walk</span>
      </div>
    ),
  },
  {
    id: 'gate', at: [0.07, 0.155], side: 'left', body: (
      <>
        <p className="beat__k">정문 · 1886</p>
        <h2>단 한 명의<br />학생으로부터</h2>
        <p>1886년, 메리 F. 스크랜턴은 서울 정동의 한옥에서 단 한 명의 학생과 수업을 시작했습니다. 이듬해 고종은 ‘배꽃이 핀 배움터’라는 뜻의 이름, <b>梨花學堂</b>을 내렸습니다.</p>
        <ul className="chips"><li><b>1886</b>개교</li><li><b>1887</b>교명 이화학당</li><li><b>1</b>첫 번째 학생</li></ul>
      </>
    ),
  },
  {
    id: 'ecc', at: [0.175, 0.275], side: 'right', body: (
      <>
        <p className="beat__k">ECC · 2008</p>
        <h2>땅을 갈라 만든<br />캠퍼스</h2>
        <p>개교 120주년을 맞아 프랑스 건축가 <b>도미니크 페로</b>가 설계한 이화캠퍼스복합단지(ECC). 건물을 땅 위에 올리는 대신 땅을 갈라 계곡 같은 길을 냈고, 양쪽 유리벽 뒤로 강의실과 열람실이 이어집니다. 지붕은 다시 잔디와 나무가 덮었습니다.</p>
        <ul className="chips"><li><b>2008</b>완공</li><li><b>120</b>주년 기념</li><li><b>국내 최대</b>지하 캠퍼스</li></ul>
      </>
    ),
  },
  {
    id: 'ai', at: [0.29, 0.395], side: 'left', body: (
      <>
        <p className="beat__k">강의실 · Human-Centered AI</p>
        <h2>140주년의 선언,<br />인간 중심 AI 대전환</h2>
        <ol className="ladder">
          {AI_STEPS.map(([y, t], i) => <li key={y} style={{ transitionDelay: `${i * 120}ms` }}><b>{y}</b><span>{t}</span></li>)}
        </ol>
        <p className="note"><span className="tag">AI 4 All Ewha</span>전공과 상관없이 모든 이화인이 AI 기초 역량을 갖추도록 설계한 전교생 AI 교육.</p>
      </>
    ),
  },
  {
    id: 'pfeiffer', at: [0.425, 0.545], side: 'right', body: (
      <>
        <p className="beat__k">파이퍼홀 · 1935</p>
        <h2>신촌의 첫 건물,<br />파이퍼홀</h2>
        <p>1935년 정동에서 신촌으로 옮겨 오며 가장 먼저 세운 화강암 고딕 건물. 이전에 큰 힘을 보탠 파이퍼 부부를 기려 이름 붙였고, 2002년 국가등록문화유산이 되었습니다.</p>
        <ol className="years">
          <li><b>1910</b>대학과 설치 — 한국 여성 고등교육의 시작</li>
          <li><b>1925</b>이화여자전문학교로 승격</li>
          <li><b>1935</b>정동에서 신촌으로</li>
          <li><b>1946</b>한국 최초의 종합대학 인가</li>
        </ol>
      </>
    ),
  },
  {
    id: 'auditorium', at: [0.56, 0.615], side: 'left', body: (
      <>
        <p className="beat__k">대강당 · 1956</p>
        <h2>동양에서 가장 컸던<br />무대</h2>
        <p>1955년 5월에 짓기 시작해 1956년 5월 문을 연 대강당. 완공 당시 규모와 설비 모두 국내는 물론 동양 최고로 기록되었습니다. 그 무대에 오늘은 이화의 창업가들이 섭니다.</p>
      </>
    ),
  },
  {
    id: 'founders', at: [0.62, 0.68], side: 'right', wide: true, body: (
      <>
        <p className="beat__k">Women Founders</p>
        <h2>아이디어를 넘어,<br />세계 무대의 창업으로</h2>
        <div className="stats">
          <div><b><Count to={21} on={active === 'founders'} /></b><span>최근 4년 TIPS 선정 기업</span></div>
          <div><b><Count to={360} on={active === 'founders'} /><small>억</small></b><span>교원창업 투자유치 (2024)</span></div>
          <div><b><Count to={2} on={active === 'founders'} /><small>년 연속</small></b><span>CES 혁신상 · 학생창업 유니유니 ‘SAAVY’</span></div>
        </div>
        <p className="note">CES 2026, 이화가 처음으로 서울통합관에 부스를 열었고 2026년 교육부 창업교육 우수대학 장관 표창을 받았습니다.</p>
      </>
    ),
  },
  {
    id: 'but', at: [0.7, 0.755], side: 'left', body: (
      <>
        <p className="beat__k">배꽃길 · 벗</p>
        <h2>우리는 서로를<br /><em>‘벗’</em>이라 부릅니다</h2>
        <p>복도에서, 잔디밭에서 — 처음 보는 사이여도 이화에서는 서로를 벗이라 부릅니다. 2007년 학내 커뮤니티 이화이언에서 정해진 호칭이 이화의 말이 되었습니다.</p>
      </>
    ),
  },
  {
    id: 'but2', at: [0.76, 0.815], side: 'right', body: (
      <>
        <p className="beat__k">수평의 이름</p>
        <h2>나이도 학번도<br />묻지 않는</h2>
        <p>선배와 후배 대신, 누구와도 같은 높이에서 마주하는 이름. 2015년부터는 학교 공식 홍보에도 쓰일 만큼, 벗은 이화를 대표하는 말이 되었습니다.</p>
      </>
    ),
  },
  {
    id: 'night', at: [0.845, 0.925], side: 'center', wide: true, body: (
      <>
        <p className="beat__k">잔디광장 · 진 · 선 · 미</p>
        <h2>한 명에서 시작한 불빛이<br />배꽃이 되었습니다</h2>
        <div className="motto">
          <div><b>眞</b><span>끝까지 묻고 스스로 답을 찾는 지성</span></div>
          <div><b>善</b><span>배운 것을 세상을 위해 쓰는 마음</span></div>
          <div><b>美</b><span>저마다의 결로 피어나는 아름다움</span></div>
        </div>
      </>
    ),
  },
  {
    id: 'finale', at: [0.95, 2], side: 'center', wide: true, body: (
      <div className="finale">
        <p className="beat__k">140th Spring · Invitation</p>
        <h2>다음 봄에 피어날 꽃은,<br />바로 당신입니다, 벗.</h2>
        <div className="finale__cta">
          <a className="btn" href="https://admission.ewha.ac.kr" target="_blank" rel="noopener">입학처 바로가기 →</a>
          <a className="btn btn--ghost" href="https://www.ewha.ac.kr" target="_blank" rel="noopener">ewha.ac.kr</a>
        </div>
      </div>
    ),
  },
];

const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.floor(min % 60)).padStart(2, '0')}`;

export default function App() {
  const host = useRef<HTMLDivElement>(null);
  const journey = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<(HTMLElement | null)[]>([]);
  const clock = useRef<HTMLSpanElement>(null);
  const sunDot = useRef<HTMLElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState({ k: 0, done: false });
  const [active, setActive] = useState('hero');
  const [stop, setStop] = useState<ChapterId>('gate');
  const list = beats(active);

  const scrollProgress = () => {
    const el = journey.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
  };
  const jump = (p: number) => {
    const el = journey.current!;
    const top = el.getBoundingClientRect().top + scrollY;
    lenis.scrollTo(top + p * (el.offsetHeight - innerHeight), { duration: 2.4 });
  };

  useEffect(() => {
    let alive = true, w: World | null = null;
    buildWorld(host.current!, { progress: scrollProgress, onLoad: (k) => alive && setLoad({ k, done: false }) })
      .then((x) => {
        if (!alive) return x.dispose();
        w = x;
        setTimeout(() => {
          if (!alive) return;
          setLoad({ k: 1, done: true });
          document.documentElement.dataset.ready = '1'; // screenshots wait for this
        }, 500);
      });

    // drive the overlay from the progress the camera is actually showing
    let raf = 0, last = '', lastStop = '';
    // only touch the DOM when a value actually changes: a custom property set
    // on <html> every frame restyles the whole page every frame
    const memo = new WeakMap<HTMLElement, Record<string, string>>();
    const put = (el: HTMLElement, prop: string, v: string) => {
      let m = memo.get(el);
      if (!m) memo.set(el, (m = {}));
      if (m[prop] === v) return;
      m[prop] = v;
      if (prop === 'text') el.textContent = v;
      else if (prop.startsWith('--')) el.style.setProperty(prop, v);
      else el.style[prop as 'visibility' | 'transform'] = v;
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const p = w ? w.shown() : scrollProgress();
      let best = '', bestK = 0;
      list.forEach((b, i) => {
        const el = beatRefs.current[i];
        if (!el) return;
        const [a, z] = b.at, fade = 0.012;
        const k = Math.min(Math.max((p - a) / fade, 0), 1) * Math.min(Math.max((z - p) / fade, 0), 1);
        put(el, '--k', k.toFixed(3));
        // fully faded cards still cost a blur + backdrop blur each frame unless hidden
        put(el, 'visibility', k > 0 ? 'visible' : 'hidden');
        el.classList.toggle('on', k > 0.5);
        if (k > bestK) { bestK = k; best = b.id; }
      });
      if (best && best !== last) setActive((last = best));
      const st = (Object.keys(CHAPTERS) as ChapterId[]).filter((c) => c !== 'hero' && c !== 'finale').find((c) => p < CHAPTERS[c][1]) ?? 'night';
      if (st !== lastStop) setStop((lastStop = st) as ChapterId);
      if (clock.current) put(clock.current, 'text', fmt(clockAt(p)));
      // the sun (then moon) crosses the little arc in the clock as the day passes
      if (sunDot.current) {
        const a = Math.PI * (1 - Math.min(1, p / 0.8));
        put(sunDot.current, 'transform', `translate(${(Math.cos(a) * 26).toFixed(2)}px, ${(-Math.sin(a) * 26).toFixed(2)}px)`);
        sunDot.current.classList.toggle('moon', p > 0.8);
      }
      if (rail.current) put(rail.current, '--p', p.toFixed(4));
      put(document.documentElement, '--night', Math.min(1, Math.max(0, (p - 0.74) / 0.12)).toFixed(3));
    };
    loop();
    return () => { alive = false; cancelAnimationFrame(raf); w?.dispose(); delete document.documentElement.dataset.ready; };
  }, []);

  const cur = STOPS.find((s) => s.id === stop)!;
  return (
    <>
      <div ref={host} className="world" aria-hidden />
      <div className="veil" />

      <div className={`loader ${load.done ? 'gone' : ''}`}>
        <svg viewBox="-50 -50 100 100" className="loader__mark" aria-hidden>
          {[0, 1, 2, 3, 4].map((i) => <ellipse key={i} cx="0" cy="-21" rx="15" ry="22" transform={`rotate(${i * 72})`} style={{ animationDelay: `${i * 0.12}s` }} />)}
          <circle r="6" />
        </svg>
        <p className="loader__t">梨花</p>
        <p className="loader__s">새벽의 정문을 여는 중 · {Math.round(load.k * 100)}%</p>
        <div className="loader__bar"><i style={{ width: `${load.k * 100}%` }} /></div>
      </div>

      <header className="top">
        <a href="#" className="brand" onClick={(e) => { e.preventDefault(); jump(0); }}>
          <span className="brand__mark">梨花</span>
          <span className="brand__name">Ewha Womans University<small>140th Spring · 1886–2026</small></span>
        </a>
        <a className="top__cta" href="https://admission.ewha.ac.kr" target="_blank" rel="noopener">입학 안내 ↗</a>
      </header>

      <aside className="hud">
        <div className="hud__dial"><i className="hud__arc" /><i ref={sunDot} className="hud__sun" /></div>
        <div className="hud__txt">
          <span ref={clock} className="hud__clock">05:40</span>
          <span className="hud__where" key={cur.id}><b>{cur.ko}</b>{cur.en}</span>
        </div>
      </aside>

      <nav className="rail" ref={rail} aria-label="장소">
        <i className="rail__fill" />
        {STOPS.map((s) => (
          <button key={s.id} className={`rail__stop ${s.id === stop ? 'on' : ''}`} style={{ top: `${CHAPTERS[s.id][0] * 100}%` }} onClick={() => jump(CHAPTERS[s.id][0] + 0.012)}>
            <span>{s.ko}</span>
          </button>
        ))}
      </nav>

      <main className="overlay">
        {list.map((b, i) => (
          <section key={b.id} ref={(el) => { beatRefs.current[i] = el; }} className={`beat beat--${b.side} ${b.wide ? 'beat--wide' : ''} beat--${b.id}`}>
            <div className="beat__card">{b.body}</div>
          </section>
        ))}
      </main>

      <div ref={journey} className="journey" />

      <footer className="foot">
        <div className="foot__in">
          <p className="foot__mark">梨花</p>
          <p>본 페이지는 Team Semicolon이 제작한 비공식 홍보 페이지입니다. 이화여자대학교 공식 정보는 <a href="https://www.ewha.ac.kr" target="_blank" rel="noopener">ewha.ac.kr</a>에서 확인하세요.</p>
          <p className="foot__src">ECC · 파이퍼홀 · 대강당 장면은 실제 건물을 바탕으로 재구성한 3D 일러스트입니다.</p>
        </div>
      </footer>
    </>
  );
}
