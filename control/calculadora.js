/*
 * WARDEN CONTROL — mini calculadora da barra lateral (só desktop). Sem tela: o app.js desenha e liga as teclas.
 * Só as quatro operações; nada financeiro (juros, parcelas, correção são das ferramentas).
 * Conta com frações exatas (BigInt): 0,1 + 0,2 = 0,3 e 1 ÷ 3 × 3 = 1, sem erro de ponto flutuante.
 * Executa na hora, como a calculadora do celular: 2 + 3 × 4 = 20. Exposto em window.ControlCalculadora.
 */
(function () {
  'use strict';
  const abs = x => (x < 0n ? -x : x);
  const mdc = (a, b) => { a = abs(a); b = abs(b); while (b) [a, b] = [b, a % b]; return a; };
  function fracao(n, d = 1n) {
    if (d < 0n) { n = -n; d = -d; }
    const g = mdc(n, d) || 1n;
    return { n: n / g, d: d / g };
  }
  /** '1234.56' / '-0.5' → fração exata */
  function ler(texto) {
    const neg = texto.startsWith('-'), [i, f = ''] = texto.replace('-', '').split('.');
    const n = BigInt((i || '0') + f), d = 10n ** BigInt(f.length);
    return fracao(neg ? -n : n, d);
  }
  const OPS = {
    '+': (a, b) => fracao(a.n * b.d + b.n * a.d, a.d * b.d),
    '−': (a, b) => fracao(a.n * b.d - b.n * a.d, a.d * b.d),
    '×': (a, b) => fracao(a.n * b.n, a.d * b.d),
    '÷': (a, b) => (b.n === 0n ? null : fracao(a.n * b.d, a.d * b.n))
  };
  /** arredonda meio para longe do zero, com `casas` casas: devolve o inteiro escalado (BigInt) */
  function escalar(fr, casas) {
    const s = 10n ** BigInt(casas), q = (abs(fr.n) * s * 2n + fr.d) / (2n * fr.d);
    return fr.n < 0n ? -q : q;
  }
  /** fração → texto com ponto decimal, até 8 casas, sem zeros sobrando */
  function texto(fr, casas = 8) {
    const q = escalar(fr, casas), neg = q < 0n, s = abs(q).toString().padStart(casas + 1, '0');
    const inteiro = s.slice(0, -casas), dec = s.slice(-casas).replace(/0+$/, '');
    return (neg && (inteiro !== '0' || dec) ? '-' : '') + inteiro + (dec ? '.' + dec : '');
  }
  /** '1234.5' → '1.234,5' (como o visor mostra) */
  function visor(t) {
    const neg = t.startsWith('-'), [i, f] = t.replace('-', '').split('.');
    return (neg ? '−' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f !== undefined ? ',' + f : '');
  }

  function criar() {
    let atual = '0', acumulado = null, op = null, novo = false, erro = '';
    const LIMITE = 15;
    function limpar() { atual = '0'; acumulado = null; op = null; novo = false; erro = ''; }
    function aplicar(a, o, b) {
      const r = OPS[o](a, b);
      if (!r) { erro = 'Não dá para dividir por zero.'; return null; }
      return r;
    }
    function digito(k) {
      if (erro) limpar();
      if (novo) { atual = '0'; novo = false; }
      if (k === '.') { if (!atual.includes('.')) atual += '.'; return; }
      if (atual.replace(/[-.]/g, '').length >= LIMITE) return;
      atual = atual === '0' ? k : atual === '-0' ? '-' + k : atual + k;
    }
    function operador(o) {
      if (erro) return;
      if (acumulado !== null && op && !novo) {
        const r = aplicar(acumulado, op, ler(atual));
        if (!r) return;
        acumulado = r; atual = texto(r);
      } else if (acumulado === null || !op) {
        acumulado = ler(atual);
      }
      op = o; novo = true;
    }
    function igual() {
      if (erro || acumulado === null || !op) return;
      const r = aplicar(acumulado, op, ler(atual));
      if (!r) return;
      atual = texto(r); acumulado = null; op = null; novo = true;
    }
    function apagar() {
      if (erro) { limpar(); return; }
      if (novo) return;
      atual = atual.length > 1 && atual !== '-0' ? atual.slice(0, -1) : '0';
      if (atual === '-') atual = '0';
    }
    /** k: '0'…'9', '.', '+', '−', '×', '÷', '=', 'C', '⌫' */
    function tecla(k) {
      if (/^[0-9.]$/.test(k)) digito(k);
      else if (OPS[k]) operador(k);
      else if (k === '=') igual();
      else if (k === 'C') limpar();
      else if (k === '⌫') apagar();
      return estado();
    }
    function estado() {
      return {
        visor: erro ? 'Erro' : visor(atual.endsWith('.') ? atual : atual),
        expressao: acumulado !== null && op ? `${visor(texto(acumulado))} ${op}` : '',
        erro, valor: atual
      };
    }
    /** centavos do número no visor (meio centavo arredonda para cima), ou null se não couber */
    function centavos() {
      if (erro) return null;
      const c = escalar(ler(atual), 2);
      return abs(c) <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(c) : null;
    }
    return { tecla, estado, centavos, limpar };
  }
  /** teclado do computador → tecla da calculadora (ou null) */
  function teclaDoTeclado(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    const k = e.key;
    if (/^[0-9]$/.test(k)) return k;
    return { '.': '.', ',': '.', '+': '+', '-': '−', '*': '×', x: '×', X: '×', '/': '÷', Enter: '=', '=': '=', Escape: 'C', Backspace: '⌫', Delete: 'C' }[k] || null;
  }

  window.ControlCalculadora = { criar, teclaDoTeclado, ler, texto, visor };
})();
