/*
 * WARDEN CONTROL — efeitos visuais. Sem biblioteca: Web Animations + requestAnimationFrame, animando só transform e opacity
 * (o número da contagem é texto trocado por quadro). Com prefers-reduced-motion, nada se mexe: os números já nascem no valor final.
 * O app.js chama aplicar(raiz) depois de cada desenho e entrarTela(raiz) ao trocar de aba. Exposto em window.ControlEfeitos.
 *
 * Marcações nos templates:
 *   data-contar="<centavos>" (+ data-formato="sinal"|"int", data-chave="<nome>")  → contagem animada até o valor exato
 *   .ctl-anel[data-anel="<0 a 100>"]  → o arco gira até o lugar e aparece
 *   .ctl-grafico svg[aria-label]      → a linha do fluxo entra suave quando o gráfico muda
 *   .ctl-card, .ctl-saldo             → brilho que segue o cursor (ou o toque)
 */
(function () {
  'use strict';
  const N = window.ControlNucleo;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  const reduzir = () => mq.matches;
  const SUAVE = 'cubic-bezier(.2,.8,.2,1)';
  const ultimos = new Map();   // último valor mostrado de cada número / anel / gráfico (anima só quando muda)

  function formatar(v, fmt) {
    if (fmt === 'int') return String(v);
    return N.formatBRL(v, fmt === 'sinal' ? { sinal: true } : {});
  }

  /** contagem de `de` até o valor do elemento; o último quadro escreve o valor exato */
  function contar(el) {
    const alvo = Number(el.dataset.contar), fmt = el.dataset.formato || '';
    if (!Number.isFinite(alvo)) return;
    const chave = 'n:' + (el.dataset.chave || el.dataset.valor || el.dataset.rel || el.dataset.previsto || '');
    const de = ultimos.has(chave) ? ultimos.get(chave) : 0;
    ultimos.set(chave, alvo);
    if (reduzir() || de === alvo) { el.textContent = formatar(alvo, fmt); return; }
    const dur = 750;
    let t0 = null;
    el.textContent = formatar(de, fmt);
    const passo = t => {
      if (!el.isConnected) return;
      if (t0 === null) t0 = t;
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = formatar(p < 1 ? Math.round(de + (alvo - de) * e) : alvo, fmt);
      if (p < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }

  function anel(el) {
    const v = Number(el.dataset.anel), chave = 'a:' + (el.dataset.chave || 'saude');
    const mudou = ultimos.get(chave) !== v;
    ultimos.set(chave, v);
    if (reduzir() || !mudou) return;
    const arco = el.querySelector('svg');
    arco.animate([{ transform: 'rotate(-140deg) scale(.86)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 900, easing: SUAVE });
  }

  function grafico(svg) {
    const chave = 'g:' + svg.getAttribute('aria-label');
    if (ultimos.get('g') === chave) return;
    const primeiro = !ultimos.has('g');
    ultimos.set('g', chave);
    if (reduzir()) return;
    const g = svg.querySelector('[data-curva]');
    if (g) g.animate([{ opacity: 0, transform: `translateY(${primeiro ? 14 : 6}px)` }, { opacity: 1, transform: 'none' }], { duration: primeiro ? 650 : 380, easing: SUAVE });
  }

  /** depois de cada desenho: números, anel, gráfico e os cards que brilham */
  function aplicar(raiz) {
    raiz.querySelectorAll('[data-contar]').forEach(contar);
    raiz.querySelectorAll('.ctl-anel[data-anel]').forEach(anel);
    const g = raiz.querySelector('.ctl-grafico svg');
    if (g) grafico(g);
    raiz.querySelectorAll('.ctl-card, .ctl-saldo').forEach(c => c.classList.add('ctl-brilho'));
    raiz.removeAttribute('aria-busy');
  }

  /** troca de aba: o conteúdo sobe de leve; o ícone da aba nova dá um pulinho */
  function entrarTela(raiz) {
    if (reduzir()) return;
    raiz.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: SUAVE });
    document.querySelectorAll('[data-menu] a[aria-current="page"] svg').forEach(s =>
      s.animate([{ transform: 'scale(.8)' }, { transform: 'scale(1.12)' }, { transform: 'none' }], { duration: 320, easing: SUAVE }));
  }

  // ---------- brilho que segue o cursor / o toque (só transform e opacity do ::before) ----------
  let alvo = null, px = 0, py = 0, agendado = false;
  function moverBrilho() {
    agendado = false;
    if (!alvo) return;
    const r = alvo.getBoundingClientRect();
    alvo.style.setProperty('--mx', (px - r.left) + 'px');
    alvo.style.setProperty('--my', (py - r.top) + 'px');
  }
  function seguir(e) {
    if (reduzir()) return;
    const card = e.target.closest && e.target.closest('.ctl-brilho');
    if (card !== alvo) { if (alvo) alvo.classList.remove('aceso'); alvo = card; }
    if (!card) return;
    px = e.clientX; py = e.clientY;
    card.classList.add('aceso');
    if (!agendado) { agendado = true; requestAnimationFrame(moverBrilho); }
  }
  document.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') seguir(e); }, { passive: true });
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    seguir(e);
    const card = alvo;
    if (card) setTimeout(() => { card.classList.remove('aceso'); if (alvo === card) alvo = null; }, 650);
  }, { passive: true });
  // o mouse saiu da janela (no toque, o pointerleave vem logo depois de soltar o dedo: quem apaga é o tempo acima)
  document.addEventListener('pointerleave', e => { if (e.pointerType !== 'mouse') return; if (alvo) alvo.classList.remove('aceso'); alvo = null; });

  window.ControlEfeitos = { reduzir, aplicar, entrarTela, contar, formatar };
})();
