// 第3弾（収束）: iso-open-box の改良版。奥/手前フラップの遠近差と線の階層を付け直した決定版候補と、
// 床の円（置き場所）を組み合わせた版。座標系は 01-iso-line.mjs と共通（辺16の等角、高さ12）。
import { H, D, U, S } from '../lib.mjs';

export const CATS = {
  boxv2: {
    name: '開いた箱の改良',
    lead: '15 案中の本命 iso-open-box を「箱っぽさ」で作り直す。奥のフラップは立ち上がり、手前のフラップは垂れて短縮する遠近を付け、外形と内側の線を太さで分ける。もう 1 案は同じ箱を床の円（置き場所の目印）に乗せ、okibasho の「場所」感を補強する。',
  },
};

// ---- 共通の箱パーツ --------------------------------------------------------
// 上面の菱形: T(24,16) R(37.86,24) B(24,32) L(10.14,24)、側面高さ12 → L'(10.14,36) B'(24,44) R'(37.86,36)
// 奥フラップ(T-L, T-R) は上へ約9.7 立ち上がり外側へ少し倒れる。手前フラップ(L-B, B-R)は約4.5 垂れ下がり側面上部に少しかぶる。
const paperSheet = (cy) => `<g class="sheet">
<path d="M24 ${cy - 4}L31 ${cy} 24 ${cy + 4} 17 ${cy}Z" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.4"/>
<path d="M21.6 ${cy}l2.4 1.4M23.2 ${cy - 1.7}l3.2 1.9" stroke="var(--accent)" stroke-width="1.1"/>
</g>`;

const boxSvg = ({ ring }) => `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round">
${ring ? '<ellipse class="ring" cx="24" cy="37" rx="19" ry="11" fill="none" stroke="var(--line)" stroke-width="1.4"/>' : ''}
<path class="face-l" d="M10.14 24L24 32 24 44 10.14 36Z" fill="var(--face-l)" stroke="none"/>
<path class="face-r" d="M24 32L37.86 24 37.86 36 24 44Z" fill="var(--face-r)" stroke="none"/>
<path class="edge-mid" d="M24 32L24 44" stroke-width="1.4"/>
<path class="body-outline" d="M10.14 24L10.14 36 24 44 37.86 36 37.86 24"/>
<g class="flap flap-bl">
<path d="M24 16L10.14 24 7.14 15 21 7Z" fill="var(--paper)" stroke="none"/>
<path d="M24 16L21 7 7.14 15 10.14 24" fill="none"/>
</g>
<g class="flap flap-br">
<path d="M24 16L37.86 24 40.86 15 27 7Z" fill="var(--paper)" stroke="none"/>
<path d="M24 16L27 7 40.86 15 37.86 24" fill="none"/>
</g>
<path class="inner" d="M24 16L37.86 24 24 32 10.14 24Z" fill="color-mix(in srgb, var(--face-r) 75%, var(--ink) 25%)" stroke-width="1.4"/>
${paperSheet(4)}
<g class="flap flap-fl">
<path d="M10.14 24L24 32 22 35.6 8.14 27.6Z" fill="var(--paper)" stroke="none"/>
<path d="M10.14 24L8.14 27.6 22 35.6 24 32" fill="none"/>
</g>
<g class="flap flap-fr">
<path d="M24 32L37.86 24 39.86 27.6 26 35.6Z" fill="var(--paper)" stroke="none"/>
<path d="M37.86 24L39.86 27.6 26 35.6 24 32" fill="none"/>
</g>
<path class="lid" d="M24 16L37.86 24 24 32 10.14 24Z" fill="var(--accent-soft)" stroke="var(--ink)" opacity="0"/>
</svg>`;

// 状態アニメーションは箱そのものについて共通。id ごとにセレクタとキーフレーム名だけ差し替える。
const boxCss = (id) => `
${H(`.i3-${id} .sheet`)}{animation:bob 1.6s ease-in-out infinite}
${H(`.i3-${id} .flap-bl`)}{transform:translate(-.5px,-.6px)}
${H(`.i3-${id} .flap-br`)}{transform:translate(.5px,-.6px)}
${D(`.i3-${id} .sheet`)}{transform:translateY(12px)}
${D(`.i3-${id} .flap-fl`)}{transform:translate(-1px,1.6px)}
${D(`.i3-${id} .flap-fr`)}{transform:translate(1px,1.6px)}
${D(`.i3-${id} .flap-bl`)}{transform:translate(-1px,-1px)}
${D(`.i3-${id} .flap-br`)}{transform:translate(1px,-1px)}
${U(`.i3-${id} .sheet`)}{animation:${id}-fall 1.2s ease-in infinite}
${S(`.i3-${id} .sheet`)}{transform:translateY(20px);opacity:0}
${S(`.i3-${id} .flap`)}{opacity:0;transform:translateY(3px)}
${S(`.i3-${id} .lid`)}{opacity:1;stroke:var(--accent)}
@keyframes ${id}-fall{0%{transform:translateY(0);opacity:1}70%{transform:translateY(24px);opacity:1}100%{transform:translateY(24px);opacity:0}}`;

export const ICONS = [
  {
    id: 'iso-open-box-v2',
    cat: 'boxv2',
    name: '等角の開いた箱（決定版）',
    motif: '四方のフラップが開いた等角の箱。奥の2枚は立ち上がり、手前の2枚は垂れて側面に少しかぶる。上面には紙が浮かぶ',
    aim: 'iso-open-box の「4枚が同じ平行四辺形で貼り付いて見える」を解消する本命の決定版。奥/手前でフラップの見かけの高さを変え、外形と内側の稜線を線幅で分けて立体の階層を作る。',
    ui: '奥フラップが立ち上がる分だけ全体の背が高く見え、箱らしいシルエットになる。24px では手前フラップの垂れが側面と混ざるが、外形線を太くしたことで輪郭は保たれる。',
    impl: 'フラップは fill 用 path と、rim と共有しない3辺だけを描く輪郭 path の2枚組（計8 path）。rim 自体の細い菱形1本がそのまま4枚分の折り目線を兼ねるので線は増えない。内側は color-mix で --face-r を一段暗く。',
    anim: '紙が上面と平行に降りて中へ沈み、success で全フラップが畳まれて上面が --accent-soft の菱形（--accent の縁）になる。drag では手前フラップだけがわずかに開く。',
    rate: { anim: 3, impl: 2, small: 3, brand: 2 },
    html: boxSvg({ ring: false }),
    css: boxCss('iso-open-box-v2'),
  },
  {
    id: 'iso-open-box-ring',
    cat: 'boxv2',
    name: '円い置き場所の上の箱',
    motif: 'iso-open-box-v2 と同じ箱を、床に描いた円（等角の楕円）の目印の上に置いた版。楕円は箱の足元より一回り大きく、箱を受けているように見える',
    aim: '箱だけでは伝わりにくい「置き場所」を、床の円で補強する。円は空いた場所の目印であり、drag / success で色付くことで "ここに置かれた" が箱の外でも語られる。',
    ui: '楕円が箱の下からわずかにはみ出すので、白いカードの上でも箱の接地感が出る。24px では楕円が薄い輪だけになるが、潰れて別の形には見えない。',
    impl: '楕円1個を箱より先に描くだけ（箱本体は共通コード）。stroke 色の切り替えと success の fill だけで状態を表すので実装コストはほぼ増えない。',
    anim: '箱側は v2 と同じ。楕円は drag で --accent の輪に変わり、success で --accent-soft に塗りつぶされて着地を強調する。uploading は箱の紙が沈む間、楕円がゆっくり明滅する。',
    rate: { anim: 3, impl: 3, small: 2, brand: 3 },
    html: boxSvg({ ring: true }),
    css: `${boxCss('iso-open-box-ring')}
${H('.i3-iso-open-box-ring .ring')}{transform:scale(1.03)}
${D('.i3-iso-open-box-ring .ring')}{stroke:var(--accent);stroke-width:1.6}
${U('.i3-iso-open-box-ring .ring')}{stroke:var(--accent);animation:pulse 1.2s ease-in-out infinite}
${S('.i3-iso-open-box-ring .ring')}{stroke:var(--accent);fill:var(--accent-soft)}`,
  },
];
