import { useEffect, useRef, useState, type ReactNode } from 'react';
import LanternLotus from './ok/lantern-lotus';
import MetalFlower from './ok/metal-flower';
import FrostedVeil from './ok/frosted-veil';
import FloralThicket from './ok/floral-thicket';
import PetalDrift from './ok/falling-canopy';
import EnergyStream from './ok/energy-stream';
import GlassPrism from './ok/glass-prism';
import OrbitWords from './ok/text-orbit-marquee';
import { EccValley } from './scene/ecc';

const NIGHT = '#04110c';
const MINT = '#8fdcb4';
const PEAR = '#f4f5ee';
const narrow = () => typeof window !== 'undefined' && window.innerWidth < 820;

// Mounts children only near the viewport (keeps WebGL context count low).
function Stage({ children, className = '', margin = '40% 0px' }: { children: ReactNode; className?: string; margin?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setOn(e.isIntersecting), { rootMargin: margin });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, [margin]);
  return <div ref={ref} className={`stage ${className}`}>{on && children}</div>;
}

function useReveal() {
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('in')), { threshold: 0.18 });
    document.querySelectorAll('.rv').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

function Count({ to }: { to: number }) {
  const ref = useRef<HTMLElement>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now(), dur = to > 999 ? 2200 : 1500;
      const tick = () => { const k = Math.min(1, (performance.now() - t0) / dur); setV(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(tick); };
      tick();
    }, { threshold: 0.5 });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, [to]);
  return <b ref={ref}>{v}</b>;
}

const TIMELINE: [string, string, string][] = [
  ['1886', '한 명의 학생', '메리 F. 스크랜턴이 서울 정동의 한옥에서 단 한 명의 학생과 함께 수업을 시작합니다.'],
  ['1887', '梨花學堂', '고종이 ‘배꽃이 핀 배움터’라는 뜻의 교명 이화학당(梨花學堂)을 내립니다.'],
  ['1910', '대학과 설치', '한국 여성 고등교육이 이곳에서 처음 시작됩니다.'],
  ['1925', '이화여자전문학교', '전문학교로 승격하며 신촌 시대를 준비합니다.'],
  ['1946', '종합대학 인가', '이화여자대학교, 한국 최초의 종합대학으로 인가받습니다.'],
  ['2026', '창립 140주년', '‘인간 중심 AI 대전환’을 새 비전으로 선포합니다.'],
];

const VIRTUES: [string, string, string, string][] = [
  ['眞', '진', 'Truth', '진리를 향해 끝까지 묻는 지성. 질문하는 법을 배우는 곳.'],
  ['善', '선', 'Goodness', '배운 것을 세상을 위해 쓰는 마음. 섬김과 나눔의 전통.'],
  ['美', '미', 'Beauty', '자신만의 결로 피어나는 아름다움. 삶을 가꾸는 감각.'],
];

const AI_STEPS: [string, string][] = [
  ['2022', '인공지능전공 신설'],
  ['2023', '인공지능대학 설립'],
  ['2024', '지능형반도체공학전공 신설'],
  ['2025', '인공지능데이터사이언스학부 신설'],
];

const BUT_LINES = ['벗들, 이거 봤어?', '벗! 이거 떨어뜨리셨어요.', '벗은 어떻게 생각하세요?'];

const ECC_CAPTIONS: [string, string, string][] = [
  ['2008', '땅을 갈라 만든 캠퍼스', '이화캠퍼스복합단지(ECC). 건물을 땅 위에 올리는 대신, 땅을 갈라 계곡을 냈습니다.'],
  ['Dominique Perrault', '유리 계곡의 양쪽 벽', '프랑스 건축가 도미니크 페로의 설계. 양쪽 유리벽 너머로 열람실과 강의실의 불빛이 흐릅니다.'],
  ['Roof Garden', '지붕은 다시 숲이 됩니다', '계곡 위의 지붕은 잔디와 나무로 덮인 정원. 캠퍼스는 땅의 모양을 그대로 지킵니다.'],
  ['The Grand Stairs', '계단 끝, 석조의 이화', '계곡 끝의 큰 계단을 오르면, 고딕 석조 건물들이 있는 이화의 언덕이 이어집니다.'],
];

function Valley() {
  const host = useRef<HTMLDivElement>(null);
  const sec = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const [prog, setProg] = useState(0);
  useEffect(() => {
    const valley = new EccValley(host.current!);
    let raf = 0, last = -1;
    const loop = () => {
      const r = sec.current!.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, -r.top / Math.max(1, r.height - innerHeight)));
      valley.setProgress(p);
      if (Math.abs(p - last) > 0.002) {
        last = p;
        setProg(p);
        setStep(Math.min(ECC_CAPTIONS.length - 1, Math.floor(p * ECC_CAPTIONS.length * 0.999)));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); valley.dispose(); };
  }, []);
  return (
    <section className="valley" id="ecc" ref={sec}>
      <div className="valley__sticky">
        <div className="valley__gl" ref={host} />
        <div className="valley__shade" />
        <div className="valley__head">
          <p className="eyebrow">VI · Ewha Campus Complex</p>
          <h2>계곡으로 걸어 내려가는 캠퍼스</h2>
        </div>
        <div className="valley__caps">
          {ECC_CAPTIONS.map(([k, t, d], i) => (
            <article key={k} className={`cap glass ${i === step ? 'on' : ''}`}>
              <span className="cap__k">{k}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </article>
          ))}
        </div>
        <div className="valley__bar"><i style={{ transform: `scaleX(${prog})` }} /></div>
        <div className="valley__hint">스크롤하여 걷기 ↓</div>
      </div>
    </section>
  );
}

// Collegiate-gothic stone hall with pear trees in bloom, drawn as an SVG skyline.
function Hall() {
  const wins = [];
  for (let i = 0; i < 14; i++) {
    const x = 140 + i * 52 + (i >= 7 ? 64 : 0);
    for (let r = 0; r < 2; r++) wins.push(<path key={`${i}-${r}`} d={`M${x} ${452 - r * 78}v-38q11 -18 22 0v38z`} className="hall__win" style={{ animationDelay: `${(i * 7 + r * 3) % 11 * 0.4}s` }} />);
  }
  const blossoms = [];
  const rnd = (n: number) => (Math.sin(n * 91.7) * 43758.5453) % 1;
  for (const [cx, cy, rr] of [[70, 420, 110], [930, 430, 120], [330, 500, 70], [690, 505, 75]] as const)
    for (let k = 0; k < 46; k++) {
      const a = Math.abs(rnd(cx + k)) * Math.PI * 2, d = Math.sqrt(Math.abs(rnd(cy + k * 3))) * rr;
      blossoms.push(<circle key={`${cx}-${k}`} cx={cx + Math.cos(a) * d} cy={cy + Math.sin(a) * d * 0.62} r={5 + Math.abs(rnd(k + cx)) * 9} className="hall__bloom" />);
    }
  return (
    <svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <defs>
        <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b3a33" /><stop offset="1" stopColor="#0d1813" /></linearGradient>
      </defs>
      <g fill="url(#stone)">
        <path d="M110 560V330h360v230zM530 560V330h360v230z" />
        <path d="M110 330l180 -70l180 70zM530 330l180 -70l180 70z" />
        <path d="M455 560V180h90v380z" />
        <path d="M445 180h110v-16h-14v-12h-14v12h-14v-12h-14v12h-14v-12h-14v12h-14v-12h-12z" />
        <path d="M455 180l-8 -40l8 0zM545 180l8 -40l-8 0z" />
      </g>
      <path d="M484 300v-52q16 -28 32 0v52z" className="hall__win hall__rose" />
      {wins}
      <g>{blossoms}</g>
      <rect x="0" y="548" width="1000" height="12" fill="#04110c" />
    </svg>
  );
}

export default function App() {
  useReveal();
  const m = narrow();
  return (
    <>
      <header className="nav">
        <a href="#top" className="nav__logo"><span className="nav__mark">梨花</span>Ewha Womans University</a>
        <nav className="nav__links"><a href="#since">1886</a><a href="#ai">AI 대전환</a><a href="#startup">창업</a><a href="#but">벗</a><a href="#ecc">ECC</a><a href="#spring">배꽃</a></nav>
        <a className="nav__cta" href="https://admission.ewha.ac.kr" target="_blank" rel="noopener">입학 안내 ↗</a>
      </header>

      {/* HERO — a pear blossom lit from inside, leaning toward the cursor */}
      <section className="hero" id="top">
        <div className="hero__flower">
          <LanternLotus
            background="transparent"
            petals={5}
            layers={4}
            flowerSize={m ? 150 : 175}
            colors={{ petal: '#f2f6ee', light: '#ffe6c4', sheen: '#8fe3b8' }}
            glow={6}
            spin={1.2}
            float={5}
            advanced={{ elevation: 46, absorption: 70, iridescence: 70, motes: 60, cup: 85, tipCurl: 60 }}
          />
        </div>
        <div className="hero__copy">
          <p className="kicker">EWHA WOMANS UNIVERSITY · SINCE 1886</p>
          <h1>가장 먼저 핀 꽃이<br />가장 멀리 갑니다</h1>
          <p className="hero__en">梨花 — where the pear blossoms first opened.</p>
          <p className="hero__badge"><span>140th</span>EWHA THE WORLD, EWHA THE FUTURE</p>
        </div>
        <div className="hero__side"><span className="dot" />커서를 가까이 — 꽃이 당신 쪽으로 기웁니다</div>
      </section>

      {/* I · SINCE — origin timeline */}
      <section className="since" id="since">
        <p className="eyebrow rv">I · Since 1886</p>
        <h2 className="rv">한 명의 학생으로 시작한 학교가<br /><span className="mint">한국 여성 교육의 첫 장</span>이 되기까지</h2>
        <ol className="timeline">
          {TIMELINE.map(([y, t, d], i) => (
            <li className="rv" key={y} style={{ transitionDelay: `${i * 80}ms` }}>
              <span className="timeline__y">{y}</span>
              <h3>{t}</h3>
              <p>{d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* II · VIRTUE — 眞善美 behind frosted glass slats */}
      <section className="virtue" id="virtue">
        <Stage className="virtue__stage">
          <FrostedVeil background={NIGHT} baseColor="#06301f" accentColor="#3f9d74" highlight="#d8efe0" speed={60} hover={160} grain={40} vignette={90} veil={{ slats: m ? 7 : 14, frost: 120, refraction: 110, edge: 110 }} style={{ minWidth: 0, minHeight: 0 }} />
        </Stage>
        <div className="virtue__inner">
          <p className="eyebrow rv">II · Motto</p>
          <h2 className="rv">진 · 선 · 미</h2>
          <p className="virtue__sub rv">Truth, Goodness, Beauty — 이화가 140년 동안 지켜 온 세 글자.</p>
          <div className="pillars">
            {VIRTUES.map(([han, ko, en, d], i) => (
              <article className="pillar rv" key={han} style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="pillar__han">{han}</span>
                <span className="pillar__ko">{ko} · {en}</span>
                <p>{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* III · AI — 140th-anniversary vision over a 3D particle stream */}
      <section className="ai" id="ai">
        <Stage className="ai__stage">
          <EnergyStream background="transparent" colors={[MINT, PEAR, '#4fbf8b', '#d9f3e6']} particles={m ? 90000 : 220000} size={m ? 4 : 4.5} shape={{ height: 11, waist: 1.7, flare: 4.5, twist: 0.6 }} core={{ show: true, diameter: 2.2, color: '#ffe6c4', spin: 2 }} glow={9} repel={10} flow={7} spin={3} lean={-18} camera={{ zoom: 6.4, turn: -180, elevation: 12 }} />
        </Stage>
        <div className="ai__copy">
          <p className="eyebrow rv">III · Human-Centered AI</p>
          <h2 className="rv">140주년의 선언,<br /><span className="mint">인간 중심 AI 대전환</span></h2>
          <p className="ai__lead rv">2026년 5월, 창립 140주년 기념식에서 이화가 선언한 새 비전입니다. 첨단기술을 앞서 이끌되, 그 중심에는 언제나 사람의 존엄과 공동체를 둡니다.</p>
          <ol className="ladder">
            {AI_STEPS.map(([y, t], i) => (
              <li className="rv" key={y} style={{ transitionDelay: `${i * 90}ms` }}><b>{y}</b><span>{t}</span></li>
            ))}
          </ol>
          <div className="ai4all glass rv">
            <span className="ai4all__tag">AI 4 All Ewha</span>
            <p>인공지능 전공생이 아니어도 괜찮습니다. 인문·예술·사회과학 어느 전공이든, 모든 이화인이 AI 기초 역량을 갖추도록 설계한 전교생 AI 교육입니다.</p>
          </div>
        </div>
        <div className="ai__hint">커서를 대면 입자가 비켜 흐릅니다</div>
      </section>

      {/* IV · STARTUP — a glass prism for ideas refracted into companies */}
      <section className="startup" id="startup">
        <div className="startup__prism rv">
          <Stage>
            <GlassPrism glass="#8fe3b8" roomTop="#ffffff" roomBottom="#2f9a6a" highlight="#ffffff" sides={3} length={m ? 14 : 17} twist={2} edge={20} tilt={14} speed={6} sizePercent={m ? 110 : 95} />
          </Stage>
          <span className="symbol__hint">드래그하여 돌려보기</span>
        </div>
        <div className="startup__copy">
          <p className="eyebrow rv">IV · Women Founders</p>
          <h2 className="rv">아이디어를 넘어,<br /><span className="mint">세계 무대의 창업으로</span></h2>
          <article className="ces glass rv">
            <span className="ces__k">CES 2026 · Innovation Awards</span>
            <h3>2년 연속 CES 혁신상</h3>
            <p>이화의 첫 CES 참가. 학생 창업기업 유니유니는 장애인 화장실 낙상·실신 감지 솔루션 ‘SAAVY’로 2025년에 이어 2026년에도 CES 혁신상을 받았습니다.</p>
          </article>
          <div className="stats stats--startup">
            <div className="rv"><Count to={21} /><span>최근 4년 TIPS 선정 기업</span></div>
            <div className="rv"><Count to={360} /><span>억 원 · 교원창업 투자유치(2024)</span></div>
            <div className="rv"><Count to={67} /><span>입주 창업기업</span></div>
          </div>
          <p className="startup__award rv">2026 창업교육 우수대학 · 교육부 장관 표창</p>
        </div>
      </section>

      {/* V · 벗 — the word Ewha students call each other, orbiting in 3D */}
      <section className="but" id="but">
        <div className="but__orbit">
          <Stage>
            <OrbitWords text="벗 · 벗 · 벗 · " background="transparent" font={{ fontFamily: "'Noto Serif KR', serif", fontWeight: 900 }} color={PEAR} rings={m ? 5 : 7} size={m ? 300 : 520} lens={3.6} speed={42} advanced={{ repeats: 10, letterScale: 88, backOpacity: 30, tilt: 22 }} />
          </Stage>
          <span className="symbol__hint">드래그하여 굴려보기</span>
        </div>
        <div className="but__copy">
          <p className="eyebrow rv">V · Culture</p>
          <h2 className="rv">우리는 서로를<br /><span className="mint">‘벗’</span>이라 부릅니다</h2>
          <p className="rv">선배도 후배도, 나이도 학번도 묻지 않습니다. 2007년 학내 커뮤니티 ‘이화이언’에서 정해진 이 호칭은, 누구와도 동등하게 마주하는 이화의 수평적 문화가 되었습니다.</p>
          <div className="bubbles">
            {BUT_LINES.map((t, i) => (
              <span className={`bubble rv ${i % 2 ? 'bubble--r' : ''}`} key={t} style={{ transitionDelay: `${i * 140}ms` }}>{t}</span>
            ))}
          </div>
        </div>
      </section>

      <Valley />

      {/* IV · SPRING — real pear petals falling over the stone campus */}
      <section className="spring" id="spring">
        <Stage className="spring__stage">
          <PetalDrift background="#06150f" baseColor={PEAR} accentColor="#ffe9ee" density={m ? 360 : 760} speed={50} direction={112} leaves={{ size: 20, spin: 80, sway: 120 }} cursor={{ push: 220, reach: 90 }} />
        </Stage>
        <div className="spring__hall"><Hall /></div>
        <div className="spring__text">
          <p className="eyebrow rv">VII · Spring</p>
          <h2 className="rv">봄이 오면,<br />이화의 언덕에<br />배꽃이 내립니다.</h2>
          <p className="rv">교명 ‘이화(梨花)’는 배꽃을 뜻합니다. 1935년 지어진 본관 파이퍼홀을 비롯한 석조 건물들 사이로, 해마다 봄이면 하얀 꽃잎이 내립니다. 커서로 꽃잎을 흩날려 보세요.</p>
        </div>
      </section>

      {/* V · SYMBOL — the school flower in porcelain, drag to turn */}
      <section className="symbol" id="symbol">
        <div className="symbol__copy">
          <p className="eyebrow rv">VIII · School Flower</p>
          <h2 className="rv">교화(校花), <span className="mint">배꽃</span></h2>
          <p className="rv">다섯 장의 하얀 꽃잎. 화려하지 않지만 가장 이른 봄에 먼저 피어 계절을 엽니다. 이화가 처음 여성에게 배움의 문을 연 것처럼.</p>
          <div className="stats">
            <div className="rv"><Count to={1886} /><span>개교</span></div>
            <div className="rv"><Count to={140} /><span>주년</span></div>
            <div className="rv"><Count to={1} /><span>첫 번째 학생</span></div>
          </div>
        </div>
        <div className="symbol__flower rv">
          <Stage>
            <MetalFlower tint="#ffffff" petals={5} rows={1} length={14} width={5} curl={2} cup={7} open={3} core={9} stem={0} spin={3} sizePercent={m ? 120 : 135} />
          </Stage>
          <span className="symbol__hint">드래그하여 돌려보기</span>
        </div>
      </section>

      {/* FINALE */}
      <section className="finale" id="apply">
        <Stage className="finale__field">
          <FloralThicket background={NIGHT} colors={[PEAR, '#ffffff', '#f6dde2', '#cfeedd']} density={m ? 5 : 6} speed={90} direction={262} gravity={40} falloff={75} depthFade={35} flowers={{ petals: 5, leafMix: 18, lineWeight: 30, scatter: 45 }} style={{ minWidth: 0, minHeight: 0 }} />
        </Stage>
        <div className="finale__inner">
          <p className="eyebrow rv">IX · Invitation</p>
          <h2 className="rv">다음 봄에 피어날 꽃은,<br />바로 당신입니다, 벗.</h2>
          <a className="btn rv" href="https://admission.ewha.ac.kr" target="_blank" rel="noopener">입학처 바로가기 →</a>
        </div>
        <footer className="footer">
          <span>본 페이지는 Team Semicolon이 제작한 비공식 홍보 페이지입니다.</span>
          <span>이화여자대학교 공식 정보 · <a href="https://www.ewha.ac.kr" target="_blank" rel="noopener">ewha.ac.kr</a></span>
        </footer>
      </section>
    </>
  );
}
