// The game's icon set: heraldic shields for tags, drawn objects for
// resources, and figures for counters and units. All on a 48x48 grid.
//
// In the page, icons are <use> references to one shared sprite (cheap, even
// with hundreds on screen). svgStandalone() gives a self-contained SVG for
// places that need one, such as the 3D board's bounty tokens.

const OUT = '#2a1a0c';

const GRADS = {
  gold: ['#fff4b8', '#f2c94c', '#b8860b', '#6b4a08'],
  silver: ['#ffffff', '#cfd5dc', '#8c949e', '#4b525b'],
  stone: ['#f3eee2', '#cbc3b0', '#968e7c', '#5f594c'],
  iron: ['#a3aab4', '#6c737d', '#40454d', '#24272c'],
  wood: ['#d9a46a', '#a86f3a', '#74461f', '#462810'],
  red: ['#f08a70', '#c0392b', '#8e1f1a', '#4e0d0a'],
  blue: ['#8fb4ee', '#3f6fbf', '#244a8a', '#122850'],
  green: ['#a6d98c', '#4f9a55', '#2c6b37', '#163a1d'],
  purple: ['#c9a4ee', '#7f4fc0', '#552d8f', '#2c1550'],
  teal: ['#8ad8d8', '#2f9196', '#1d6166', '#0d3336'],
  brown: ['#d4ad7f', '#9a7451', '#6b4e33', '#3b2a1a'],
  rose: ['#f6b6d4', '#c45a8e', '#8e2f5f', '#4d1532'],
  amber: ['#f7da8f', '#cf9a34', '#93661b', '#563a0b'],
  gem: ['#f3e6ff', '#b47be6', '#7438b4', '#3b1666'],
  ruby: ['#ffc0c0', '#e0404a', '#a01822', '#550a10'],
  parch: ['#fffaf0', '#f3e6c4', '#dcc796', '#b09a63'],
  wheat: ['#fff1b3', '#ecc451', '#c0901f', '#7a5a0c'],
  bread: ['#f4cf8a', '#d39a4c', '#9e6526', '#5f3912'],
  wax: ['#ff8a7a', '#cf2e2e', '#8f1414', '#4a0606'],
};

function grads() {
  let s = '';
  for (const [id, c] of Object.entries(GRADS)) {
    s += `<radialGradient id="dd-${id}" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="${c[0]}"/><stop offset=".35" stop-color="${c[1]}"/><stop offset=".75" stop-color="${c[2]}"/><stop offset="1" stop-color="${c[3]}"/></radialGradient>`;
    s += `<linearGradient id="dd-${id}-v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset=".45" stop-color="${c[1]}"/><stop offset="1" stop-color="${c[3]}"/></linearGradient>`;
  }
  s += '<linearGradient id="dd-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>';
  return s;
}

const g = (id) => `url(#dd-${id})`;
const gv = (id) => `url(#dd-${id}-v)`;

// ------------------------------------------------------------------ shields
const SHIELD = 'M24 3.5 41.5 8.5V22c0 11.5-7.5 18.5-17.5 22.5C14 40.5 6.5 33.5 6.5 22V8.5z';
const shield = (color, charge) => `
  <path d="${SHIELD}" fill="${g(color)}" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M24 6.6 38.6 10.8V22c0 9.8-6.2 15.8-14.6 19.4C15.6 37.8 9.4 31.8 9.4 22V10.8z" fill="none" stroke="${gv('gold')}" stroke-width="1.8"/>
  <path d="M10 11.5 24 7.5l14 4v4c-6-2.5-22-2.5-28 0z" fill="#fff" opacity=".18"/>
  ${charge}`;
const C = { fill: '#fbf1d6', stroke: OUT };

const TAGS = {
  building: shield('brown', `
    <path d="M15.5 36.5V19.5h-1.5v-6h3.4v2.6h2.6v-2.6h3v2.6H26v-2.6h3v2.6h2.6v-2.6H35v6h-1.5v17z" fill="${C.fill}" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M21 36.5v-6a3 3 0 0 1 6 0v6z" fill="${OUT}"/>
    <rect x="22.8" y="21.5" width="2.4" height="4.2" rx="1.2" fill="${OUT}"/>
    <path d="M15.5 19.5h18" stroke="${OUT}" stroke-width="1.2"/>`),
  military: shield('red', `
    <g stroke="${OUT}" stroke-width="1.3" stroke-linejoin="round">
      <path d="M14 13.5l2.2-.2 13.6 13.6-2.1 2.1L14.1 15.4z" fill="url(#dd-silver-v)"/>
      <path d="M34 13.5l-2.2-.2-13.6 13.6 2.1 2.1 13.6-13.6z" fill="url(#dd-silver-v)"/>
      <path d="M25.6 27.6l4.8-4.8 1.6 1.6-4.8 4.8zM22.4 27.6l-4.8-4.8-1.6 1.6 4.8 4.8z" fill="${gv('gold')}"/>
      <path d="M29.2 30.4l3.8 3.8M18.8 30.4 15 34.2" stroke-width="2.6" stroke-linecap="round"/>
      <circle cx="33.8" cy="35" r="1.9" fill="${g('gold')}"/><circle cx="14.2" cy="35" r="1.9" fill="${g('gold')}"/>
    </g>`),
  trade: shield('amber', `
    <path d="M19.5 15.5h9l-2.2 4c5.6 2 8.7 6.6 8.7 11 0 4.4-4.2 7-11 7s-11-2.6-11-7c0-4.4 3.1-9 8.7-11z" fill="${C.fill}" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M20.5 19.5c2.3.8 4.7.8 7 0" stroke="${OUT}" stroke-width="1.6" fill="none"/>
    <path d="M22.5 19.8c-1 1.6-1.2 3.2-.4 4.6" stroke="#b8860b" stroke-width="1.2" fill="none"/>
    <circle cx="24" cy="30.5" r="4.4" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.2"/>
    <path d="M22.6 29v3h2.8" stroke="${OUT}" stroke-width="1" fill="none"/>`),
  farming: shield('green', `
    <g stroke="${OUT}" stroke-width="1.1" stroke-linejoin="round">
      <path d="M24 38V16M24 38l-6-15M24 38l6-15" stroke-width="1.6" fill="none"/>
      ${[[24, 12.5, 0], [17.4, 19, -22], [30.6, 19, 22]].map(([x, y, r]) => `<g transform="rotate(${r} ${x} ${y + 4})">
        <ellipse cx="${x}" cy="${y}" rx="2" ry="3.4" fill="${g('wheat')}"/>
        <ellipse cx="${x - 2.4}" cy="${y + 3.4}" rx="1.7" ry="3" fill="${g('wheat')}" transform="rotate(-25 ${x - 2.4} ${y + 3.4})"/>
        <ellipse cx="${x + 2.4}" cy="${y + 3.4}" rx="1.7" ry="3" fill="${g('wheat')}" transform="rotate(25 ${x + 2.4} ${y + 3.4})"/></g>`).join('')}
      <path d="M19.5 30.5c3 1.6 6 1.6 9 0" stroke="${OUT}" stroke-width="2.6" fill="none"/>
      <path d="M19.5 30.5c3 1.6 6 1.6 9 0" stroke="#c0392b" stroke-width="1.4" fill="none"/>
    </g>`),
  faith: shield('blue', `
    <circle cx="24" cy="18.5" r="8" fill="none" stroke="${gv('gold')}" stroke-width="1.8" opacity=".9"/>
    <path d="M21.4 11.5h5.2l-.9 4.8 4.8-.9v5.2l-4.8-.9.9 13.8h-5.2l.9-13.8-4.8.9v-5.2l4.8.9z" fill="${C.fill}" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>`),
  scholar: shield('teal', `
    <path d="M11.5 18.5c4-1.6 8.5-1.2 12.5 1.4 4-2.6 8.5-3 12.5-1.4v14c-4-1.6-8.5-1.2-12.5 1.4-4-2.6-8.5-3-12.5-1.4z" fill="${C.fill}" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M24 19.9v14M14.5 22c2.6-.6 5-.4 7 .6M14.5 25.4c2.6-.6 5-.4 7 .6M26.5 22.6c2-1 4.4-1.2 7-.6M26.5 26c2-1 4.4-1.2 7-.6" stroke="${OUT}" stroke-width=".9" fill="none"/>
    <path d="M33.5 9.5c-3.4 2.4-6 6.8-7 11.6l1.3.4c1.6-4.6 3.8-8.4 5.7-12z" fill="#fff" stroke="${OUT}" stroke-width="1"/>`),
  court: shield('purple', `
    <path d="M13.5 31.5l-1.6-13 6 5.6 6.1-9.2 6.1 9.2 6-5.6-1.6 13z" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
    <rect x="13.2" y="31" width="21.6" height="4.4" rx="1" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.3"/>
    <circle cx="24" cy="14.2" r="1.7" fill="${g('ruby')}" stroke="${OUT}" stroke-width=".8"/>
    <circle cx="11.9" cy="18.2" r="1.4" fill="${g('ruby')}" stroke="${OUT}" stroke-width=".8"/>
    <circle cx="36.1" cy="18.2" r="1.4" fill="${g('ruby')}" stroke="${OUT}" stroke-width=".8"/>
    <circle cx="19" cy="33.2" r="1.1" fill="${g('blue')}"/><circle cx="24" cy="33.2" r="1.1" fill="${g('ruby')}"/><circle cx="29" cy="33.2" r="1.1" fill="${g('green')}"/>`),
  culture: shield('rose', `
    <path d="M17 13.5c-3 3-3 9.5 1.6 13.5v5.5h10.8V27c4.6-4 4.6-10.5 1.6-13.5" fill="none" stroke="${OUT}" stroke-width="4.4" stroke-linecap="round"/>
    <path d="M17 13.5c-3 3-3 9.5 1.6 13.5v5.5h10.8V27c4.6-4 4.6-10.5 1.6-13.5" fill="none" stroke="${gv('gold')}" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="16.5" y="32" width="15" height="4" rx="1.4" fill="${g('wood')}" stroke="${OUT}" stroke-width="1.2"/>
    <path d="M17.5 16.5h13" stroke="${OUT}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M17.5 16.5h13" stroke="${gv('gold')}" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M21 17v15M24 17v15M27 17v15" stroke="${C.fill}" stroke-width=".9"/>`),
};

// --------------------------------------------------------------- resources
const RES = {
  gold: `
    <circle cx="24" cy="24.8" r="19" fill="${OUT}"/>
    <circle cx="24" cy="24" r="18.6" fill="${g('gold')}" stroke="${OUT}" stroke-width="2"/>
    <circle cx="24" cy="24" r="14.2" fill="none" stroke="#8a6410" stroke-width="1.4"/>
    <circle cx="24" cy="24" r="15.6" fill="none" stroke="#8a6410" stroke-width=".8" stroke-dasharray="1.2 1.6"/>
    <path d="M15.5 29l-1-9.2 4.8 4.4 4.7-7 4.7 7 4.8-4.4-1 9.2z" fill="#f6d67a" stroke="#7a5408" stroke-width="1.3" stroke-linejoin="round"/>
    <path d="M15.4 29.2h17.2v2.4H15.4z" fill="#f6d67a" stroke="#7a5408" stroke-width="1.2"/>
    <path d="M10 17a16 16 0 0 1 10-9" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none" opacity=".7"/>`,
  stone: `
    <path d="M5.5 31.5 17 26l13.5 5.5L19 37.5z" fill="#f6f1e4" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M5.5 31.5V39L19 45.5v-8z" fill="${gv('stone')}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M19 37.5v8L30.5 39v-7.5z" fill="#8c8473" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M17.5 13.5 30 8l13 5.5-12.5 6z" fill="#f6f1e4" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M17.5 13.5v8.5l13 6.5V19.5z" fill="${gv('stone')}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M30.5 19.5V28.5L43 22v-8.5z" fill="#8c8473" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M9 34.5l2.5 1.2M22 40l3-1.5M34 22.5l3-1.4M21 18l4 2" stroke="#6f6858" stroke-width="1" stroke-linecap="round"/>`,
  ore: `
    <path d="M31 6.5l2.6-1.4 9.4 16.6-2.6 1.4z" fill="${gv('wood')}" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M24.5 9.5c5.6-4.4 13.2-5.4 19.5-2.6l-.8 1.7c-5.6-1.8-11.4-.6-16.6 2.8z" fill="${gv('iron')}" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M5 37.5 9.5 22l10-7.5 12.5 3 7.5 11.5-3.5 11-15 4z" fill="${g('iron')}" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M9.5 22l7.5 6 15-10.5M17 28l4 14.5M17 28 5 37.5M32 17.5l4 22.5" stroke="#23262b" stroke-width="1" fill="none" opacity=".7"/>
    <path d="M12.5 26.5l3.2-1.1 1.4 3-2.8 1.6zM22.5 21.5l3.8-.6.8 3.4-3.6.9zM24.5 33l3.4-1 1.2 3.2-3.3 1.2zM13 35.5l2.6-.4.6 2.6-2.8.6z" fill="#ff9a3c" stroke="#7a3304" stroke-width=".8"/>
    <path d="M12.8 26.6l1.4-.4M22.8 21.6l1.6-.3" stroke="#ffe0b0" stroke-width=".8"/>`,
  food: `
    <path d="M5 30c0-9 8.6-15.5 19-15.5S43 21 43 30c0 4.6-3.4 7.5-8 7.5H13c-4.6 0-8-2.9-8-7.5z" fill="${g('bread')}" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M13 22.5c1.6 2.2 2.4 4.6 2.4 7.2M20.5 18.5c1.8 2.8 2.6 6 2.6 9.4M28.5 18.5c1.8 2.8 2.6 6 2.6 9.4M35.5 22.5c1.4 2.2 2 4.4 2 6.8" stroke="#6b3c10" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M13 22.5c1.6 2.2 2.4 4.6 2.4 7.2M20.5 18.5c1.8 2.8 2.6 6 2.6 9.4M28.5 18.5c1.8 2.8 2.6 6 2.6 9.4M35.5 22.5c1.4 2.2 2 4.4 2 6.8" stroke="#f7d79a" stroke-width=".8" stroke-linecap="round" fill="none" transform="translate(-.8 -.4)"/>
    <path d="M9.5 24c2.5-4 7-6.5 11.5-7.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".5" fill="none"/>
    <g transform="rotate(30 38 14)"><path d="M38 4v20" stroke="${OUT}" stroke-width="1.4"/>
      <ellipse cx="38" cy="7" rx="1.8" ry="3.2" fill="${g('wheat')}" stroke="${OUT}" stroke-width=".9"/>
      <ellipse cx="35.8" cy="11" rx="1.6" ry="2.8" fill="${g('wheat')}" stroke="${OUT}" stroke-width=".9" transform="rotate(-25 35.8 11)"/>
      <ellipse cx="40.2" cy="11" rx="1.6" ry="2.8" fill="${g('wheat')}" stroke="${OUT}" stroke-width=".9" transform="rotate(25 40.2 11)"/></g>`,
  rm: `
    ${[[17, 30], [31, 30], [24, 18]].map(([x, y]) => `
      <circle cx="${x}" cy="${y}" r="7.6" fill="${g('wood')}" stroke="${OUT}" stroke-width="1.8"/>
      <circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#5a3514" stroke-width=".9"/>
      <circle cx="${x}" cy="${y}" r="2.4" fill="none" stroke="#5a3514" stroke-width=".9"/>
      <path d="M${x - 1} ${y - 6.5}l1.4 3" stroke="#5a3514" stroke-width=".8"/>`).join('')}
    <path d="M6 25.5c10 4.6 26 4.6 36 0" stroke="${OUT}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M6 25.5c10 4.6 26 4.6 36 0" stroke="#d9b27a" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-dasharray="2.2 1.2"/>
`,
  lux: `
    <path d="M12 7.5h24c0 9.5-3.6 16-12 17.5C15.6 23.5 12 17 12 7.5z" fill="${g('gold')}" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M14.5 9.5h19c-.6 6.6-3.6 11.2-9.5 12.6-5.9-1.4-8.9-6-9.5-12.6z" fill="${g('ruby')}" opacity=".85"/>
    <path d="M22 25h4v8.5h-4z" fill="${gv('gold')}" stroke="${OUT}" stroke-width="1.6"/>
    <path d="M13.5 41.5c0-4.4 4.6-8 10.5-8s10.5 3.6 10.5 8z" fill="${g('gold')}" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M12 41h24v2.6H12z" fill="${gv('gold')}" stroke="${OUT}" stroke-width="1.6"/>
    <path d="M24 13.6l2.6 3-2.6 3-2.6-3z" fill="${g('gem')}" stroke="${OUT}" stroke-width=".9"/>
    <circle cx="17.6" cy="15.2" r="1.4" fill="${g('green')}" stroke="${OUT}" stroke-width=".7"/>
    <circle cx="30.4" cy="15.2" r="1.4" fill="${g('blue')}" stroke="${OUT}" stroke-width=".7"/>
    <path d="M15 10.5c.4 3 1.4 5.4 3 7.2" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".6" fill="none"/>`,
  card: `
    <path d="M12 9.5h22c2 0 3.5 1.5 3.5 3.5v24c0 2.5 1.6 3.5 3.5 3.5H16c-2 0-4-1.6-4-4z" fill="${gv('parch')}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M12 9.5c-2.4 0-4.5 1.6-4.5 4s2 3.6 4.5 3.6" fill="${g('parch')}" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M37.5 37c0 2.4 1.4 3.5 3.5 3.5s3.5-1.3 3.5-3.5-1.6-3.2-3.5-3.2h-3.5" fill="${g('parch')}" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M17 16h15M17 20.5h15M17 25h10" stroke="#8a7350" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="27" cy="32.5" r="4.6" fill="${g('wax')}" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M25 37l-1.4 4.4 3.4-1.8 3.4 1.8L29 37" fill="#cf2e2e" stroke="${OUT}" stroke-width="1"/>
    <path d="M25.3 32.5h3.4M27 30.8v3.4" stroke="#ffd0c4" stroke-width="1"/>`,
};

// ------------------------------------------------------- favor and points
const FAVOR = {
  rf: `
    <path d="M9 34.5 6 14.5l9.5 8.5L24 9l8.5 14 9.5-8.5-3 20z" fill="${g('gold')}" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M13.5 22c3.6 1.4 7 2 10.5 2s6.9-.6 10.5-2l-1 9.5c-3.2.8-6.4 1.2-9.5 1.2s-6.3-.4-9.5-1.2z" fill="${g('red')}" opacity=".9"/>
    <rect x="8.5" y="34" width="31" height="6" rx="1.6" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.8"/>
    <circle cx="24" cy="9" r="2.6" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.3"/>
    <circle cx="6" cy="14.5" r="2.2" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.2"/>
    <circle cx="42" cy="14.5" r="2.2" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.2"/>
    <circle cx="16" cy="37" r="1.5" fill="${g('blue')}"/><circle cx="24" cy="37" r="1.8" fill="${g('ruby')}"/><circle cx="32" cy="37" r="1.5" fill="${g('green')}"/>
    <path d="M24 17.5l2 3.2-2 3.2-2-3.2z" fill="${g('gem')}" stroke="${OUT}" stroke-width=".8"/>`,
  fp: `
    <path d="M24 3.5c2 1.6 4.4 1 6.4 2.6 1.4 2.2 3.8 2.6 5.2 4.8.4 2.6 2.6 4 2.8 6.6-.8 2.4.4 4.8-.4 7.2-1.4 2-1 4.6-2.6 6.6-2.2 1.2-3 3.6-5.2 4.8-2.6.2-4.4 2-6.8 2s-4.2-1.8-6.8-2c-2.2-1.2-3-3.6-5.2-4.8-1.6-2-1.2-4.6-2.6-6.6-.8-2.4.4-4.8-.4-7.2.2-2.6 2.4-4 2.8-6.6 1.4-2.2 3.8-2.6 5.2-4.8 2-1.6 4.4-1 6.4-2.6z" fill="${g('wax')}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="24" cy="22" r="11.5" fill="none" stroke="#7a0d0d" stroke-width="1.4"/>
    <path d="M24 13c1.6 2 2.4 4 2.2 6.4 1.6-1.6 3.6-1.8 5-.6 1.2 1.2.6 3.4-1.4 3.8-1.6.4-3-.2-3.8-1.2-.2 1.4-.6 2.6-1.2 3.6h3.4v1.8h-3.4c.4 1.6 1.2 2.8 2.4 3.6h-6.4c1.2-.8 2-2 2.4-3.6h-3.4v-1.8h3.4c-.6-1-1-2.2-1.2-3.6-.8 1-2.2 1.6-3.8 1.2-2-.4-2.6-2.6-1.4-3.8 1.4-1.2 3.4-1 5 .6-.2-2.4.6-4.4 2.2-6.4z" fill="#ffd9a0" stroke="#7a0d0d" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M13 12.5c2-2.6 4.6-4.2 7.4-4.8" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".45" fill="none"/>
    <path d="M17 39.5l-3.5 6.5 5-1.2 2.5 2.8 1.6-6.4M31 39.5l3.5 6.5-5-1.2-2.5 2.8-1.6-6.4" fill="${g('wax')}" stroke="${OUT}" stroke-width="1.3" stroke-linejoin="round"/>`,
  event: `
    <path d="M6 20.5v7l4 .6 22 8.4V12.5L10 20z" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M32 12.5c3 3 4.6 7 4.6 11.5S35 32.5 32 35.5" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.8"/>
    <ellipse cx="33" cy="24" rx="3.4" ry="11.5" fill="#6b4a08" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M11 28.5l5.5 2 0 9.5-5.5-2.4z" fill="${g('red')}" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="M12.5 31.5l2.4.9M12.5 34.5l2.4.9" stroke="#f6d67a" stroke-width="1"/>
    <path d="M39.5 15l4.5-3M40.5 24h5M39.5 33l4.5 3" stroke="${OUT}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M39.5 15l4.5-3M40.5 24h5M39.5 33l4.5 3" stroke="#f6d67a" stroke-width="1" stroke-linecap="round"/>`,
};

// ------------------------------------------------------------ counters
const figure = (color, head = '', extra = '') => `
  <path d="M10 44c0-11 5.6-18 14-18s14 7 14 18z" fill="${g(color)}" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M24 26.5v17.5" stroke="${OUT}" stroke-width="1" opacity=".5"/>
  <circle cx="24" cy="17" r="8" fill="#f1cfa8" stroke="${OUT}" stroke-width="2"/>
  <circle cx="21.2" cy="17.4" r=".9" fill="${OUT}"/><circle cx="26.8" cy="17.4" r=".9" fill="${OUT}"/>
  ${head}${extra}`;
const TOKENS = {
  'tok-noble': figure('purple',
    `<path d="M16 11.5l-.6-7 3.6 3 5-5 5 5 3.6-3-.6 7z" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
     <circle cx="24" cy="5.5" r="1.3" fill="${g('ruby')}"/>`,
    `<path d="M15 31c3 2.6 6 3.8 9 3.8s6-1.2 9-3.8" stroke="#f6ecd2" stroke-width="2.6" fill="none"/>
     <path d="M15 31c3 2.6 6 3.8 9 3.8s6-1.2 9-3.8" stroke="${OUT}" stroke-width="1" stroke-dasharray="1 2" fill="none"/>`),
  'tok-acolyte': `
    <path d="M10 44c0-11 5.6-18 14-18s14 7 14 18z" fill="${g('brown')}" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M13 24c0-9 4.6-17 11-17s11 8 11 17c-3 2.6-7 4-11 4s-8-1.4-11-4z" fill="${g('brown')}" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M17.5 20.5c0-5 2.8-8.5 6.5-8.5s6.5 3.5 6.5 8.5c-1.8 1.6-4 2.4-6.5 2.4s-4.7-.8-6.5-2.4z" fill="#f1cfa8" stroke="${OUT}" stroke-width="1.6"/>
    <circle cx="21.6" cy="18.2" r=".9" fill="${OUT}"/><circle cx="26.4" cy="18.2" r=".9" fill="${OUT}"/>
    <path d="M22.6 31h2.8v3.4h3.2v2.8h-3.2V42h-2.8v-4.8h-3.2v-2.8h3.2z" fill="${g('gold')}" stroke="${OUT}" stroke-width="1"/>`,
  'tok-scholar': figure('teal',
    `<path d="M14 10.5 24 6l10 4.5-10 4.6z" fill="${OUT}"/><path d="M18 12.6v3c3.6 1.6 8.4 1.6 12 0v-3" fill="#123a3d" stroke="${OUT}" stroke-width="1.2"/>
     <path d="M33 11v6" stroke="${g('gold')}" stroke-width="1.4"/><circle cx="33" cy="17.6" r="1.2" fill="${g('gold')}"/>`,
    `<path d="M16.5 33.5c2.6-1 5-1 7.5.4 2.5-1.4 4.9-1.4 7.5-.4v7c-2.6-1-5-1-7.5.4-2.5-1.4-4.9-1.4-7.5-.4z" fill="#fbf1d6" stroke="${OUT}" stroke-width="1.3" stroke-linejoin="round"/>
     <path d="M24 33.9v7" stroke="${OUT}" stroke-width="1"/>`),
  'tok-worker': figure('amber',
    `<path d="M15.5 14.5c0-5 3.8-8.5 8.5-8.5s8.5 3.5 8.5 8.5c-5.6-1.6-11.4-1.6-17 0z" fill="${g('green')}" stroke="${OUT}" stroke-width="1.5"/>`,
    `<path d="M28 31l9.5 9.5" stroke="${OUT}" stroke-width="3.6" stroke-linecap="round"/>
     <path d="M28 31l9.5 9.5" stroke="${g('wood')}" stroke-width="2" stroke-linecap="round"/>
     <path d="M24.5 30.5l5.5-5.5 4 4-5.5 5.5z" fill="${g('iron')}" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>`),
  'tok-artisan': figure('rose',
    `<path d="M15 13c0-5.4 4-8.5 9-8.5 5.6 0 9 3.6 9 7-2.4-1-4.4-1.2-6.2-.4L15 13z" fill="${g('red')}" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
     <circle cx="33.4" cy="11.4" r="1.6" fill="${g('red')}" stroke="${OUT}" stroke-width="1"/>`,
    `<path d="M15 35c0-4 3.6-6.5 8-6.5 4.6 0 8 2.6 8 6 0 2-1.6 2.8-3.2 2.3-1.4-.5-2.6.2-2.6 1.6 0 1.6-1.4 2.6-3.6 2.6-3.6 0-6.6-2.2-6.6-6z" fill="#f3e3c3" stroke="${OUT}" stroke-width="1.3"/>
     <circle cx="19" cy="34" r="1.4" fill="${g('red')}"/><circle cx="23" cy="31.6" r="1.4" fill="${g('blue')}"/><circle cx="27.4" cy="32.8" r="1.4" fill="${g('gold')}"/>
     <path d="M31 30l8-8.5" stroke="${OUT}" stroke-width="2.6" stroke-linecap="round"/><path d="M31 30l8-8.5" stroke="${g('wood')}" stroke-width="1.2" stroke-linecap="round"/>`),
};

// ---------------------------------------------------------------- units
// Units take the player's colour from CSS `color` (currentColor).
const shade = (d) => `<path d="${d}" fill="url(#dd-shade)"/>`;
const UNITS = {
  settlers: `
    <path d="M6 31V20c0-7 8-12 18-12s18 5 18 12v11z" fill="#f6eed8" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M14 10.5v20.5M24 8v23M34 10.5v20.5" stroke="#b9a782" stroke-width="1.6"/>
    <path d="M6 31V20c0-7 8-12 18-12s18 5 18 12v11z" fill="url(#dd-shade)"/>
    <rect x="3.5" y="30" width="41" height="5" rx="1.4" fill="currentColor" stroke="${OUT}" stroke-width="1.8"/>
    ${[13, 35].map((x) => `<circle cx="${x}" cy="38.5" r="6.4" fill="${g('wood')}" stroke="${OUT}" stroke-width="2"/><circle cx="${x}" cy="38.5" r="1.8" fill="${OUT}"/><path d="M${x} 32.6v11.8M${x - 5.8} 38.5h11.6" stroke="${OUT}" stroke-width="1.1"/>`).join('')}`,
  soldiers: `
    <path d="M42.5 2.5 31.5 46" stroke="${OUT}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M42.5 2.5 31.5 46" stroke="${gv('wood')}" stroke-width="2" stroke-linecap="round"/>
    <path d="M42 1l3.4 1.6-1 6.2-3.6-1.2z" fill="${g('silver')}" stroke="${OUT}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M22 8 37 12.5v11c0 9-6 15-15 19-9-4-15-10-15-19v-11z" fill="currentColor" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/>
    ${shade('M22 8 37 12.5v11c0 9-6 15-15 19-9-4-15-10-15-19v-11z')}
    <path d="M22 11v28.5M9.6 20.5h24.8" stroke="#f6ecd2" stroke-width="3.4"/>
    <path d="M22 10.6 34.6 14.4v9.1c0 7.6-5 12.8-12.6 16.2-7.6-3.4-12.6-8.6-12.6-16.2v-9.1z" fill="none" stroke="${gv('gold')}" stroke-width="1.2"/>`,
  knights: `
    <path d="M24 6c2-3.4 6.6-5 11-3.6 4.4 1.4 6.6 5.4 5.6 9.4-2.6-2.4-6-3-9.2-2" fill="currentColor" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M24 6c2-3.4 6.6-5 11-3.6 4.4 1.4 6.6 5.4 5.6 9.4-2.6-2.4-6-3-9.2-2" fill="url(#dd-shade)"/>
    <path d="M10.5 38V19.5C10.5 10.5 16.5 5 24 5s13.5 5.5 13.5 14.5V38z" fill="${g('silver')}" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M24 5.4V38" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M12.5 19.5h9.6M25.9 19.5h9.6" stroke="${OUT}" stroke-width="3.2" stroke-linecap="round"/>
    ${[27, 30.5].map((y) => [17, 20.5, 27.5, 31].map((x) => `<circle cx="${x}" cy="${y}" r=".95" fill="${OUT}"/>`).join('')).join('')}
    <path d="M14 10.5c2.4-2.6 5.6-4 9-4.2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".7" fill="none"/>
    <path d="M6.5 46c0-5 3-8.5 7.5-8.5h20c4.5 0 7.5 3.5 7.5 8.5z" fill="currentColor" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M6.5 46c0-5 3-8.5 7.5-8.5h20c4.5 0 7.5 3.5 7.5 8.5z" fill="url(#dd-shade)"/>
    <path d="M9.5 37.5h29" stroke="${gv('gold')}" stroke-width="2.4" stroke-linecap="round"/>`,
  caravan: `
    <path d="M6.5 15.5h24v15h-24z" fill="${g('wood')}" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M9 9.5c2.4-2 5.2-2.4 8-1.2l2 7.2H8.5z" fill="${g('amber')}" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M18 8.5h8.5l1.5 7h-10z" fill="${g('purple')}" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M24.5 6c2-1.4 4.4-1.4 6 0v9.5h-6z" fill="${g('red')}" stroke="${OUT}" stroke-width="1.5"/>
    <path d="M4 30h29.5v4.5H4z" fill="currentColor" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M33.5 32l9.5-3.5" stroke="${OUT}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M40.5 4.5v13" stroke="${OUT}" stroke-width="1.6"/><path d="M40.5 4.5l6 2.6-6 2.6z" fill="currentColor" stroke="${OUT}" stroke-width="1.2" stroke-linejoin="round"/>
    ${[12, 27].map((x) => `<circle cx="${x}" cy="38" r="6" fill="${g('wood')}" stroke="${OUT}" stroke-width="2"/><circle cx="${x}" cy="38" r="1.7" fill="${OUT}"/><path d="M${x} 32.4v11.2M${x - 5.6} 38h11.2" stroke="${OUT}" stroke-width="1.1"/>`).join('')}`,
};

// --------------------------------------------------- board things on cards
const PLACES = {
  road: `
    <path d="M17 45 21 3h6l4 42z" fill="${g('stone')}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M24 6v6M24 18v6M24 30v6M24 41v3" stroke="#fbf1d6" stroke-width="2" stroke-linecap="round"/>
    <path d="M6 45c3-9 6-18 9-42M42 45c-3-9-6-18-9-42" stroke="${g('green')}" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  church: `
    <path d="M8 44V25l10-9 10 9v19z" fill="#f6f1e4" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M6 26 18 14.5 30 26" fill="none" stroke="${g('blue')}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M28 44V18h10v26z" fill="#ece4cf" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M26.5 19 33 6l6.5 13z" fill="${g('blue')}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M33 1v6M30.6 3.2h4.8" stroke="${gv('gold')}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M15 44v-7a3 3 0 0 1 6 0v7z" fill="${g('wood')}" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M31 31v-4a2 2 0 0 1 4 0v4z" fill="${g('blue')}" stroke="${OUT}" stroke-width="1.1"/>
    <circle cx="18" cy="27" r="2.6" fill="${g('ruby')}" stroke="${OUT}" stroke-width="1"/>`,
  cathedral: `
    <path d="M14 44V22h20v22z" fill="#f6f1e4" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M12.5 23 24 13l11.5 10z" fill="${g('blue')}" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>
    ${[6, 36].map((x) => `<path d="M${x} 44V17h6v27z" fill="#ece4cf" stroke="${OUT}" stroke-width="1.6"/><path d="M${x - 1} 18 ${x + 3} 5l4 13z" fill="${g('blue')}" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>`).join('')}
    <circle cx="24" cy="28" r="4.4" fill="${g('gem')}" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M24 23.6v8.8M19.6 28h8.8" stroke="${OUT}" stroke-width=".9"/>
    <path d="M20 44v-7a4 4 0 0 1 8 0v7z" fill="${g('wood')}" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M24 7v6M21.6 9h4.8M9 0v5M39 0v5" stroke="${gv('gold')}" stroke-width="1.6" stroke-linecap="round"/>`,
  city: `
    <path d="M4 44V24h9v20zM35 44V24h9v20z" fill="${g('stone')}" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M3 25V20h2.4v2h2v-2h2.2v2h2v-2H14v5zM34 25V20h2.4v2h2v-2h2.2v2h2v-2H45v5z" fill="${g('stone')}" stroke="${OUT}" stroke-width="1.4"/>
    <path d="M13 44V28h22v16z" fill="#ece4cf" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M17 28V14h14v14z" fill="#f6f1e4" stroke="${OUT}" stroke-width="1.8"/>
    <path d="M15.5 15 24 5l8.5 10z" fill="${g('red')}" stroke="${OUT}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M24 5V0" stroke="${OUT}" stroke-width="1.4"/><path d="M24 .5l5 2-5 2z" fill="${g('gold')}" stroke="${OUT}" stroke-width=".8"/>
    <path d="M20 44v-6a4 4 0 0 1 8 0v6z" fill="${g('wood')}" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M22 19.5h4v4h-4z" fill="${OUT}"/>`,
  peace: `
    <path d="${SHIELD}" fill="${g('parch')}" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M15 27c2-6.5 7-10 12-10 2.4 0 4.2 1 5 2.4l4.5-.6-3.4 2.4c.4 4.6-3 9.4-9 10.6l-2 5.2-1.4-4.8c-2.4 0-4.2-.6-5.7-1.6z" fill="#fff" stroke="${OUT}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M18.5 25.5c2.4-3 5.4-4.4 8.6-4.2" stroke="${OUT}" stroke-width="1" fill="none"/>
    <circle cx="30" cy="20" r=".9" fill="${OUT}"/>
    <path d="M36 21.5c1.6 1.6 2 3.6 1 5.4" stroke="${g('green')}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  tradetrack: `
    <path d="M24 6v34M12 44h24" stroke="${OUT}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M24 6v34M12 44h24" stroke="${gv('gold')}" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M7 12h34" stroke="${OUT}" stroke-width="3" stroke-linecap="round"/><path d="M7 12h34" stroke="${gv('gold')}" stroke-width="1.6" stroke-linecap="round"/>
    <circle cx="24" cy="6" r="2.6" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.2"/>
    <path d="M8 12 3 25M8 12l5 13M40 12l-5 13M40 12l5 13" stroke="${OUT}" stroke-width="1"/>
    <path d="M2 25h12c0 3.4-2.8 5.5-6 5.5S2 28.4 2 25zM34 25h12c0 3.4-2.8 5.5-6 5.5S34 28.4 34 25z" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.4" stroke-linejoin="round"/>`,
  march: `
    <path d="M12 4h12v20c0 2 1 3 3 3.6l9 2.4c4 1 6 3.4 6 7v3H8.5L10 28z" fill="${g('brown')}" stroke="${OUT}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M8.5 40H42v4H8z" fill="${g('wood')}" stroke="${OUT}" stroke-width="1.6"/>
    <path d="M12 9h12M12 14h12" stroke="${OUT}" stroke-width="1.2" opacity=".6"/>
    <path d="M28 33l6 1.4M26 30.5l5 1.2" stroke="${OUT}" stroke-width="1.2"/>
    <circle cx="9" cy="33" r="3.6" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.3"/>
    <path d="M9 29.4v7.2M5.4 33h7.2" stroke="${OUT}" stroke-width=".9"/>`,
  rival: `
    <circle cx="24" cy="24" r="20" fill="${g('red')}" stroke="${OUT}" stroke-width="2.2"/>
    <path d="M15 33 33 15M15 15l18 18" stroke="${OUT}" stroke-width="6" stroke-linecap="round"/>
    <path d="M15 33 33 15M15 15l18 18" stroke="#fbe2d6" stroke-width="3" stroke-linecap="round"/>`,
};

export const ICONS = {
  ...TAGS, ...RES, ...FAVOR, ...TOKENS, ...UNITS, ...PLACES,
  // a plain wax seal, for printing Favor Points on
  seal: `
    <path d="M24 3.5c2 1.6 4.4 1 6.4 2.6 1.4 2.2 3.8 2.6 5.2 4.8.4 2.6 2.6 4 2.8 6.6-.8 2.4.4 4.8-.4 7.2-1.4 2-1 4.6-2.6 6.6-2.2 1.2-3 3.6-5.2 4.8-2.6.2-4.4 2-6.8 2s-4.2-1.8-6.8-2c-2.2-1.2-3-3.6-5.2-4.8-1.6-2-1.2-4.6-2.6-6.6-.8-2.4.4-4.8-.4-7.2.2-2.6 2.4-4 2.8-6.6 1.4-2.2 3.8-2.6 5.2-4.8 2-1.6 4.4-1 6.4-2.6z" fill="${g('wax')}" stroke="${OUT}" stroke-width="1.8" stroke-linejoin="round"/>
    <circle cx="24" cy="22" r="11.5" fill="none" stroke="#7a0d0d" stroke-width="1.4"/>
    <circle cx="24" cy="22" r="13.6" fill="none" stroke="#7a0d0d" stroke-width=".8" stroke-dasharray="1 1.6"/>
    <path d="M13 12.5c2-2.6 4.6-4.2 7.4-4.8" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".45" fill="none"/>
    <path d="M17 39.5l-3.5 6.5 5-1.2 2.5 2.8 1.6-6.4M31 39.5l3.5 6.5-5-1.2-2.5 2.8-1.6-6.4" fill="${g('wax')}" stroke="${OUT}" stroke-width="1.3" stroke-linejoin="round"/>`,
  // a plain coin, for printing a cost on
  coin: `
    <circle cx="24" cy="24.8" r="21" fill="${OUT}"/>
    <circle cx="24" cy="24" r="20.6" fill="${g('gold')}" stroke="${OUT}" stroke-width="2"/>
    <circle cx="24" cy="24" r="16.4" fill="none" stroke="#8a6410" stroke-width="1.4"/>
    <circle cx="24" cy="24" r="18.2" fill="none" stroke="#8a6410" stroke-width=".9" stroke-dasharray="1.3 1.7"/>
    <circle cx="24" cy="24" r="15.6" fill="#f6d67a" opacity=".35"/>
    <path d="M9 17a17 17 0 0 1 10.5-9.5" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none" opacity=".7"/>`,
  power: TAGS.military,
  faith: TAGS.faith,
  culture: TAGS.culture,
  wealth: `
    ${[[10, 36], [16, 30], [10, 24]].map(([x, y]) => `<ellipse cx="${x + 6}" cy="${y + 4}" rx="11" ry="4.6" fill="#6b4a08" stroke="${OUT}" stroke-width="1.6"/><ellipse cx="${x + 6}" cy="${y + 2}" rx="11" ry="4.6" fill="${g('gold')}" stroke="${OUT}" stroke-width="1.6"/>`).join('')}
    <circle cx="33" cy="17" r="11" fill="${g('gold')}" stroke="${OUT}" stroke-width="2"/>
    <circle cx="33" cy="17" r="7.6" fill="none" stroke="#8a6410" stroke-width="1.2"/>
    <path d="M28.6 20l-.6-5 2.6 2.4 2.4-3.8 2.4 3.8 2.6-2.4-.6 5z" fill="#f6d67a" stroke="#7a5408" stroke-width="1" stroke-linejoin="round"/>`,
};

// --------------------------------------------------------------- output
let installed = false;
export function installSprite(doc = document) {
  if (installed || !doc || !doc.body) return;
  installed = true;
  const symbols = Object.entries(ICONS).map(([name, body]) => `<symbol id="ico-${name}" viewBox="0 0 48 48">${body}</symbol>`).join('');
  const holder = doc.createElement('div');
  holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  holder.setAttribute('aria-hidden', 'true');
  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg"><defs>${grads()}</defs>${symbols}</svg>`;
  doc.body.prepend(holder);
}

export function svgUse(name) {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><use href="#ico-${ICONS[name] ? name : 'card'}"/></svg>`;
}

export function svgStandalone(name, size = 64) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48"><defs>${grads()}</defs>${ICONS[name] || ''}</svg>`;
}
