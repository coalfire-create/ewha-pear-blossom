import { useEffect, useRef, useState, type ReactNode } from 'react';
import LanternLotus from './ok/lantern-lotus';
import { buildStudents } from './scene/students';
import { buildVirtue } from './scene/virtue';
import { buildAI } from './scene/ai';
import { buildFounder } from './scene/founder';
import { buildFriends } from './scene/friends';
import { buildEcc } from './scene/ecc';
import { buildSpring } from './scene/spring';
import { buildSymbol } from './scene/symbol';
import { buildCanopy } from './scene/canopy';

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

type Built = { dispose(): void };
type Builder = (host: HTMLDivElement, section: HTMLElement, onStep: (i: number) => void) => Built | Promise<Built>;

// Hosts a hand-built three.js scene; builders may be async (font loading).
function Scene3D({ build }: { build: (host: HTMLDivElement) => Built | Promise<Built> }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true, built: Built | null = null;
    Promise.resolve(build(ref.current!)).then((b) => (alive ? (built = b) : b.dispose()));
    return () => { alive = false; built?.dispose(); };
  }, []);
  return <div ref={ref} className="gl" />;
}

// A tall section whose 3D scene stays pinned while scrolling drives it; the
// caption card for the current step fades in over the scene.
function Pinned({ id, vh, build, head, caps, side, dots, className = '' }: {
  id: string; vh: number; build: Builder; head?: ReactNode; caps?: [string, string, string][];
  side?: (step: number) => ReactNode; dots?: boolean; className?: string;
}) {
  const sec = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  return (
    <section className={`pin ${className}`} id={id} ref={sec} style={{ height: `${vh}vh` }}>
      <div className="pin__sticky">
        <Stage><Scene3D build={(h) => build(h, sec.current!, setStep)} /></Stage>
        <div className="pin__shade" />
        {head && <div className="pin__head">{head}</div>}
        {caps && (
          <div className="pin__caps">
            {caps.map(([k, t, d], i) => (
              <article key={k + t} className={`cap glass ${i === step ? 'on' : ''}`}>
                <span className="cap__k">{k}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </article>
            ))}
          </div>
        )}
        {side?.(step)}
        {caps && dots && <ol className="pin__dots">{caps.map(([k], i) => <li key={k} className={i <= step ? 'on' : ''}>{k}</li>)}</ol>}
        <div className="pin__hint">스크롤 ↓</div>
      </div>
    </section>
  );
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
  ['1886', '단 한 명의 학생', '메리 F. 스크랜턴이 서울 정동의 한옥에서 단 한 명의 학생과 함께 수업을 시작합니다.'],
  ['1887', '梨花學堂', '고종이 ‘배꽃이 핀 배움터’라는 뜻의 교명 이화학당(梨花學堂)을 내립니다.'],
  ['1910', '대학과 설치', '한국 여성 고등교육이 이곳에서 처음 시작됩니다.'],
  ['1925', '이화여자전문학교', '흰 저고리, 검은 치마의 학생들. 전문학교로 승격하며 신촌 시대를 준비합니다.'],
  ['1946', '종합대학 인가', '이화여자대학교, 한국 최초의 종합대학으로 인가받습니다.'],
  ['2026', '140번째 봄', '한 명에서 시작한 불빛이 모여 배꽃이 되었습니다. 창립 140주년.'],
];

const VIRTUES: [string, string, string][] = [
  ['眞 · 진 · Truth', '빛을 지나 드러나는 진리', '하얀 빛이 유리를 지나면 숨어 있던 일곱 빛깔이 드러납니다. 끝까지 묻고, 스스로 답을 찾아가는 지성 — 이화가 가장 먼저 가르치는 것은 질문하는 법입니다.'],
  ['善 · 선 · Goodness', '나누면 커지는 불빛', '한 사람의 초롱불을 옆 사람에게 건네면, 불은 줄지 않고 하나가 더 켜집니다. 배운 것을 세상을 위해 쓰는 마음, 섬김과 나눔의 전통입니다.'],
  ['美 · 미 · Beauty', '저마다의 결로 피어나는', '아름다움은 하나의 정답이 아니라 각자의 결로 피어나는 것. 이화는 한 사람 한 사람이 자기만의 꽃을 피우도록 곁을 지킵니다.'],
];

const AI_STEPS: [string, string][] = [
  ['2022', '인공지능전공 신설'],
  ['2023', '인공지능대학 설립'],
  ['2024', '지능형반도체공학전공 신설'],
  ['2025', '인공지능데이터사이언스학부 신설'],
];

const FOUNDERS: [string, string, string][] = [
  ['CES 2026', '이화, 처음으로 CES 무대에 서다', '서울통합관의 이화여대 부스에서 학생·교원 창업기업이 AI·헬스케어·보안 기술을 세계 바이어 앞에 선보였습니다.'],
  ['Innovation Awards', '2년 연속 CES 혁신상', '학생 창업기업 유니유니의 ‘SAAVY’ — 장애인 화장실 낙상·실신 감지 솔루션 — 가 2025년에 이어 2026년에도 혁신상을 받았습니다.'],
  ['To the World', '서울에서 세계 시장으로', '최근 4년간 21개 기업이 TIPS에 선정됐고, 교원창업 투자유치는 2024년 약 360억 원으로 늘었습니다.'],
  ['2026', '창업교육 우수대학', '여성 특화 창업 생태계와 글로벌 네트워크를 인정받아 교육부 장관 표창을 받았습니다.'],
];

const FRIENDS: [string, string, string][] = [
  ['벗!', '“벗!” 하고 부르면', '복도에서, 잔디밭에서 — 처음 보는 사이여도 이화에서는 서로를 ‘벗’이라 부릅니다.'],
  ['2007', '이화이언에서 시작된 이름', '학내 커뮤니티 이화이언에서 정해진 호칭이 오프라인으로 퍼져 이화의 말이 되었습니다.'],
  ['수평', '나이도 학번도 묻지 않는', '선배와 후배 대신, 누구와도 같은 높이에서 마주하는 이름. 그래서 벗은 언제든 모여 함께 걷습니다.'],
  ['함께', '벗과 함께 걷는 길', '2015년부터는 학교 공식 홍보에도 쓰일 만큼, 벗은 이화를 대표하는 말이 되었습니다.'],
];

const ECC_CAPTIONS: [string, string, string][] = [
  ['2008', '땅을 갈라 만든 캠퍼스', '이화캠퍼스복합단지(ECC). 건물을 땅 위에 올리는 대신, 땅을 갈라 계곡 같은 길을 냈습니다.'],
  ['Dominique Perrault', '유리와 스테인리스의 계곡', '프랑스 건축가 도미니크 페로의 설계. 양쪽 유리벽 앞의 촘촘한 금속 핀이 빛을 받아 반짝입니다.'],
  ['Roof Garden', '지붕은 다시 숲이 됩니다', '계곡 위의 지붕은 잔디와 나무로 덮인 정원. 캠퍼스는 땅의 모양을 그대로 지킵니다.'],
  ['The Grand Stairs', '계단 끝, 석조의 이화', '계곡 끝의 큰 계단을 오르면, 고딕 석조 건물들이 있는 이화의 언덕이 이어집니다.'],
];

export default function App() {
  useReveal();
  const m = narrow();
  return (
    <>
      <header className="nav">
        <a href="#top" className="nav__logo"><span className="nav__mark">梨花</span>Ewha Womans University</a>
        <nav className="nav__links"><a href="#since">1886</a><a href="#virtue">진·선·미</a><a href="#ai">AI 대전환</a><a href="#startup">창업</a><a href="#but">벗</a><a href="#ecc">ECC</a><a href="#spring">배꽃</a></nav>
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

      <Pinned id="since" vh={620} build={buildStudents} caps={TIMELINE} dots
        head={<><p className="eyebrow">I · Since 1886</p><h2>단 한 명의 학생으로 시작한 학교가<br /><span className="mint">한국 여성 교육의 첫 장</span>이 되기까지</h2></>} />

      <Pinned id="virtue" vh={460} build={buildVirtue} caps={VIRTUES} className="pin--virtue"
        head={<><p className="eyebrow">II · Motto</p><h2>진 · 선 · 미</h2></>} />

      <Pinned id="ai" vh={420} build={buildAI} className="pin--ai"
        head={<><p className="eyebrow">III · Human-Centered AI</p><h2>140주년의 선언,<br /><span className="mint">인간 중심 AI 대전환</span></h2></>}
        side={(s) => (
          <div className="ai__side">
            <ol className="ladder">
              {AI_STEPS.map(([y, t], i) => <li key={y} className={i <= s ? 'on' : ''}><b>{y}</b><span>{t}</span></li>)}
            </ol>
            <div className="ai4all glass">
              <span className="ai4all__tag">AI 4 All Ewha</span>
              <p>인공지능 전공생이 아니어도 괜찮습니다. 어느 전공이든 모든 이화인이 AI 기초 역량을 갖추도록 설계한 전교생 AI 교육입니다.</p>
            </div>
          </div>
        )} />

      <Pinned id="startup" vh={440} build={buildFounder} caps={FOUNDERS}
        head={<><p className="eyebrow">IV · Women Founders</p><h2>아이디어를 넘어,<br /><span className="mint">세계 무대의 창업으로</span></h2></>} />

      <section className="stats-band">
        <div className="stats stats--startup">
          <div className="rv"><Count to={21} /><span>최근 4년 TIPS 선정 기업</span></div>
          <div className="rv"><Count to={360} /><span>억 원 · 교원창업 투자유치(2024)</span></div>
          <div className="rv"><Count to={2} /><span>년 연속 CES 혁신상</span></div>
        </div>
      </section>

      <Pinned id="but" vh={440} build={buildFriends} caps={FRIENDS}
        head={<><p className="eyebrow">V · Culture</p><h2>우리는 서로를<br /><span className="mint">‘벗’</span>이라 부릅니다</h2></>} />

      <Pinned id="ecc" vh={560} build={buildEcc} caps={ECC_CAPTIONS} className="pin--ecc"
        head={<><p className="eyebrow">VI · Ewha Campus Complex</p><h2>계곡으로 걸어 내려가는 캠퍼스</h2></>} />

      <Pinned id="spring" vh={320} build={(h, sec) => buildSpring(h, sec)} className="pin--spring"
        side={() => (
          <div className="spring__text">
            <p className="eyebrow">VII · Spring</p>
            <h2>봄이 오면,<br />이화의 언덕에<br />배꽃이 내립니다.</h2>
            <p>교명 ‘이화(梨花)’는 배꽃을 뜻합니다. 1935년 지어진 본관 파이퍼홀을 비롯한 석조 건물들 사이로, 해마다 봄이면 하얀 꽃잎이 길을 덮습니다.</p>
          </div>
        )} />

      {/* VIII · SYMBOL — the school flower up close, drag to turn */}
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
            <Scene3D build={buildSymbol} />
          </Stage>
          <span className="symbol__hint">드래그하여 돌려보기</span>
        </div>
      </section>

      {/* FINALE */}
      <section className="finale" id="apply">
        <Stage className="finale__field">
          <Scene3D build={buildCanopy} />
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
