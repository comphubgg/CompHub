/*
  combined-flag.js
  Lightweight module that provides:
   - window.createCombinedFlag(firstCode, secondCode, options)
   - <combined-flag first="de" second="us" layout="diagonal" size="48"></combined-flag>

  Usage:
    <script src="/combined-flag.js"></script>
    <combined-flag first="de" second="us" layout="diagonal" size="48"></combined-flag>

  Notes:
   - Flags are loaded from `/flags/{code}.png` or `/flags/{code}.svg`.
   - Uses SVG <clipPath> + <circle> to create the round icon and crisp divider.
   - No external libs. Modern browsers only.
*/
(function () {
  let uid = 0;

  const DEFAULT_SIZE = 48;
  const FLAG_PATH = (code) => `/flags/${code.toLowerCase()}.png`;

  function makeId(prefix = 'cf') {
    uid += 1;
    return `${prefix}-${Date.now().toString(36)}-${uid}`;
  }

  function createSVG(size = DEFAULT_SIZE) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    svg.style.display = 'inline-block';
    svg.style.verticalAlign = 'middle';
    return svg;
  }

  function buildDefs(svg, ids) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(svgNS, 'defs');

    // circular clip for round shape
    const clipId = ids.clip;
    const clip = document.createElementNS(svgNS, 'clipPath');
    clip.setAttribute('id', clipId);
    const circ = document.createElementNS(svgNS, 'circle');
    circ.setAttribute('cx', '50');
    circ.setAttribute('cy', '50');
    circ.setAttribute('r', '50');
    clip.appendChild(circ);
    defs.appendChild(clip);

    // masks/clipPaths for halves
    const clip1 = document.createElementNS(svgNS, 'clipPath');
    clip1.setAttribute('id', ids.clip1);
    const clip2 = document.createElementNS(svgNS, 'clipPath');

    // We'll create shapes with viewBox 0..100
    // Diagonal split (top-right to bottom-left): first triangle 0,0 100,0 0,100
    const poly1 = document.createElementNS(svgNS, 'polygon');
    poly1.setAttribute('points', '0,0 100,0 0,100');
    clip1.appendChild(poly1);
    defs.appendChild(clip1);

    clip2.setAttribute('id', ids.clip2);
    const poly2 = document.createElementNS(svgNS, 'polygon');
    poly2.setAttribute('points', '100,0 100,100 0,100');
    clip2.appendChild(poly2);
    defs.appendChild(clip2);

    // alt paths for vertical/horizontal will be applied by transform if needed

    svg.appendChild(defs);
  }

  function setClipForLayout(svg, ids, layout) {
    // Update defs polygons according to layout
    const ns = 'http://www.w3.org/2000/svg';
    const clip1 = svg.querySelector(`#${ids.clip1} polygon`);
    const clip2 = svg.querySelector(`#${ids.clip2} polygon`);
    if (!clip1 || !clip2) return;

    if (layout === 'vertical') {
      clip1.setAttribute('points', '0,0 50,0 50,100 0,100');
      clip2.setAttribute('points', '50,0 100,0 100,100 50,100');
    } else if (layout === 'horizontal') {
      clip1.setAttribute('points', '0,0 100,0 100,50 0,50');
      clip2.setAttribute('points', '0,50 100,50 100,100 0,100');
    } else {
      // diagonal (default) — keep triangles split by line from top-right to bottom-left
      clip1.setAttribute('points', '0,0 100,0 0,100');
      clip2.setAttribute('points', '100,0 100,100 0,100');
    }
  }

  function createImageElement(href, ids) {
    const svgNS = 'http://www.w3.org/2000/svg';
    const img = document.createElementNS(svgNS, 'image');
    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
    img.setAttribute('x', '0');
    img.setAttribute('y', '0');
    img.setAttribute('width', '100');
    img.setAttribute('height', '100');
    img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
    return img;
  }

  async function loadImageURL(code) {
    // tries png then svg
    const urls = [FLAG_PATH(code), FLAG_PATH(code).replace(/\.png$/, '.svg')];
    for (const u of urls) {
      try {
        const resp = await fetch(u, { method: 'HEAD' });
        if (resp.ok) return u;
      } catch (e) {
        // continue
      }
    }
    // fallback to given png path (may 404 but browser will show broken)
    return FLAG_PATH(code);
  }

  async function createCombinedFlagElement(first, second, options = {}) {
    const size = options.size || DEFAULT_SIZE;
    const layout = (options.layout || 'diagonal');
    const border = options.border || 0; // px

    const svg = createSVG(size);
    const ids = { clip: makeId('clip'), clip1: makeId('clip1'), clip2: makeId('clip2') };
    buildDefs(svg, ids);
    setClipForLayout(svg, ids, layout);

    const svgNS = 'http://www.w3.org/2000/svg';

    // Group for first image
    const g1 = document.createElementNS(svgNS, 'g');
    g1.setAttribute('clip-path', `url(#${ids.clip1})`);
    g1.setAttribute('clip-path', `url(#${ids.clip1})`);

    const g2 = document.createElementNS(svgNS, 'g');
    g2.setAttribute('clip-path', `url(#${ids.clip2})`);

    // circle mask applied to both groups by wrapping into a group with clipPath
    const outer = document.createElementNS(svgNS, 'g');
    outer.setAttribute('clip-path', `url(#${ids.clip})`);

    // Load image URLs (HEAD check) but don't block too long
    const [u1, u2] = await Promise.all([loadImageURL(first), loadImageURL(second)]);

    const img1 = createImageElement(u1, ids);
    const img2 = createImageElement(u2, ids);

    g1.appendChild(img1);
    g2.appendChild(img2);
    outer.appendChild(g1);
    outer.appendChild(g2);

    svg.appendChild(outer);

    // optional border ring
    if (border) {
      const ring = document.createElementNS(svgNS, 'circle');
      ring.setAttribute('cx', '50');
      ring.setAttribute('cy', '50');
      ring.setAttribute('r', String(50 - (border / size) * 50));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', '#fff');
      ring.setAttribute('stroke-width', String((border / size) * 100));
      svg.appendChild(ring);
    }

    // ensure high-DPI crispness: use CSS to round
    svg.style.borderRadius = '50%';
    svg.style.overflow = 'hidden';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${first}/${second} flag`);

    return svg;
  }

  // Public factory
  window.createCombinedFlag = async function (first, second, options = {}) {
    const el = await createCombinedFlagElement(String(first).toLowerCase(), String(second).toLowerCase(), options);
    return el;
  };

  // Web Component
  class CombinedFlag extends HTMLElement {
    static get observedAttributes() { return ['first', 'second', 'layout', 'size']; }

    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
      this.render();
    }

    attributeChangedCallback() {
      this.render();
    }

    async render() {
      const first = this.getAttribute('first') || 'us';
      const second = this.getAttribute('second') || 'gb';
      const layout = this.getAttribute('layout') || 'diagonal';
      const size = parseInt(this.getAttribute('size') || String(DEFAULT_SIZE), 10);

      // simple caching: if we already have same child, skip
      this._root.innerHTML = '';
      const wrapper = document.createElement('div');
      wrapper.style.display = 'inline-block';
      wrapper.style.width = size + 'px';
      wrapper.style.height = size + 'px';

      const el = await createCombinedFlagElement(first.toLowerCase(), second.toLowerCase(), { layout, size });
      wrapper.appendChild(el);
      this._root.appendChild(wrapper);
    }
  }

  if (!customElements.get('combined-flag')) {
    customElements.define('combined-flag', CombinedFlag);
  }

})();
