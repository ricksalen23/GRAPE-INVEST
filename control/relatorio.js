/*
 * WARDEN CONTROL — saídas do relatório mensal: PDF (jsPDF + padrão da marca do /assets/tools.js) e imagem PNG (desenhada em <canvas>).
 * Os números vêm prontos de ControlNucleo.dadosRelatorio(); aqui só se desenha. jsPDF e o kit são carregados só quando a pessoa pede.
 * Exposto em window.ControlRelatorio = { pdf, imagem, nomeArquivo, carregarKit }.
 */
(function () {
  'use strict';
  const N = window.ControlNucleo;
  const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

  const carregando = {};
  function carregarScript(src) {
    return carregando[src] || (carregando[src] = new Promise((ok, falha) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok;
      s.onerror = () => { delete carregando[src]; s.remove(); falha(new Error('Não consegui carregar um arquivo necessário. Confira a internet e tente de novo.')); };
      document.head.appendChild(s);
    }));
  }
  /** kit das ferramentas (copiarTexto, novoPdf…); com { pdf: true } também o jsPDF */
  async function carregarKit({ pdf = false } = {}) {
    if (pdf && !window.jspdf) await carregarScript(JSPDF);
    if (!window.Warden) await carregarScript('/assets/tools.js');
    return window.Warden;
  }

  const titulo = d => 'Relatório de ' + N.nomeMes(d.ym);
  const brl = (c, o) => N.formatBRL(c, o);
  function nomeArquivo(d, ext) { return `warden-relatorio-${d.ym}${d.perfil === 'tudo' ? '' : '-' + d.perfil}.${ext}`; }

  // ---------- PDF (A4, mm) ----------
  async function pdf(d) {
    const W = await carregarKit({ pdf: true });
    const doc = W.novoPdf(), t = W.textoPdf, M = W.PDF.margem, larg = W.PDF.largura - 2 * M;
    let y = 24;
    const novaPagina = precisa => { if (y + precisa > W.PDF.altura - 22) { doc.addPage(); y = 22; } };
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19);
    doc.text(t(titulo(d)), M, y);
    y += 7;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110, 108, 100);
    doc.text(t(`Warden Control · ${N.NOME_PERFIL[d.perfil]} · gerado em ${N.dataBR(d.ref)}`), M, y);
    y += 9;

    const caixas = (itens, alto) => {
      const gap = 5, w = (larg - gap * (itens.length - 1)) / itens.length;
      itens.forEach(([rot, val, cor], i) => {
        const x = M + i * (w + gap);
        doc.setFillColor(245, 244, 239); doc.roundedRect(x, y, w, alto, 2.5, 2.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(120, 118, 110);
        doc.text(t(rot.toUpperCase()), x + 5, y + 7);
        doc.setFontSize(14); doc.setTextColor(...(cor || [20, 20, 18]));
        doc.text(t(val), x + 5, y + 16);
      });
      doc.setTextColor(20, 20, 18);
      y += alto + 5;
    };
    caixas([['Recebido', brl(d.recebido)], ['Pago', brl(d.pago)],
      ['Resultado', brl(d.resultado, { sinal: true }), d.resultado < 0 ? [200, 40, 40] : d.resultado > 0 ? [70, 110, 10] : null]], 21);
    caixas([[`Saldo de hoje (${N.dataBR(d.ref)})`, brl(d.saldoHoje), d.saldoHoje < 0 ? [200, 40, 40] : null],
      d.fimMes ? [`${d.fimMes.previsto ? 'Previsto' : 'Saldo'} em ${N.dataBR(d.fimMes.data)}`, brl(d.fimMes.saldo), d.fimMes.saldo < 0 ? [200, 40, 40] : null]
        : ['Fim do mês', 'Fora da previsão']], 21);

    const secao = nome => {
      novaPagina(16);
      y += 5;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.text(t(nome), M, y);
      y += 3; doc.setDrawColor(225, 223, 216); doc.line(M, y, M + larg, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    };
    secao('Onde mais gastou');
    if (!d.porCategoria.length) { doc.setTextColor(110, 108, 100); doc.text(t('Nenhum pagamento neste mês ainda.'), M, y); doc.setTextColor(20, 20, 18); y += 7; }
    const maxCat = d.porCategoria.length ? d.porCategoria[0].valor : 1;
    d.porCategoria.slice(0, 6).forEach((c, i) => {
      novaPagina(12);
      doc.text(t(c.nome), M, y);
      doc.setFont('helvetica', 'bold'); doc.text(t(brl(c.valor)), M + larg, y, { align: 'right' }); doc.setFont('helvetica', 'normal');
      doc.setFillColor(238, 236, 230); doc.roundedRect(M, y + 2, larg, 2.2, 1.1, 1.1, 'F');
      if (i === 0) doc.setFillColor(200, 242, 107); else doc.setFillColor(150, 148, 140);
      doc.roundedRect(M, y + 2, Math.max(2.2, larg * c.valor / maxCat), 2.2, 1.1, 1.1, 'F');
      y += 10;
    });

    secao('Próximas contas (30 dias)');
    if (!d.proximas.length) { doc.setTextColor(110, 108, 100); doc.text(t('Nada vencendo nos próximos 30 dias.'), M, y); doc.setTextColor(20, 20, 18); y += 7; }
    d.proximas.forEach(c => {
      novaPagina(8);
      doc.setTextColor(...(c.atrasada ? [200, 40, 40] : [110, 108, 100]));
      doc.text(t(N.dataBR(c.vencimento).slice(0, 5)), M, y);
      doc.setTextColor(20, 20, 18);
      doc.text(t(doc.splitTextToSize(c.descricao + (c.atrasada ? ' (atrasada)' : ''), larg - 70)[0]), M + 18, y);
      doc.setFont('helvetica', 'bold');
      doc.text(t(`${c.tipo === 'receber' ? '+' : '-'} ${brl(c.valor)}`), M + larg, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      y += 7;
    });
    W.rodapePdf(doc);
    return doc;
  }

  // ---------- imagem (canvas 1080 px de largura, altura conforme o conteúdo) ----------
  const COR = { fundo: '#000000', card: '#131311', texto: '#F3F1EA', fraco: '#8A887E', sutil: '#57564D', acento: '#C8F26B', vermelho: '#F87171', trilho: '#262622' };
  function logo() {
    return new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = '/warden-logo-cropped-transparent.png'; });
  }
  async function imagem(d) {
    try { await Promise.all(['600 64px Fraunces', '600 40px Inter', '400 28px Inter'].map(f => document.fonts.load(f))); } catch (e) { /* segue com a fonte de reserva */ }
    const L = 1080, P = 72, cats = d.porCategoria.slice(0, 4), prox = d.proximas.slice(0, 6);
    const H = 680 + 96 + Math.max(1, cats.length) * 74 + 96 + Math.max(1, prox.length) * 62 + (d.proximas.length > prox.length ? 44 : 0) + 120;
    const cv = document.createElement('canvas');
    cv.width = L; cv.height = H;
    const g = cv.getContext('2d');
    const fonte = (peso, tam, fam = 'Inter') => { g.font = `${peso} ${tam}px ${fam === 'Fraunces' ? "Fraunces, Georgia, serif" : "Inter, 'Helvetica Neue', Arial, sans-serif"}`; };
    const texto = (s, x, y, cor, alinhar = 'left') => { g.fillStyle = cor; g.textAlign = alinhar; g.fillText(s, x, y); };
    const cortar = (s, max) => { if (g.measureText(s).width <= max) return s; while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; };
    const caixa = (x, y, w, h, r, cor) => { g.fillStyle = cor; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
    const rotulo = (s, x, y) => { fonte(600, 22); if ('letterSpacing' in g) g.letterSpacing = '3px'; texto(s.toUpperCase(), x, y, COR.fraco); if ('letterSpacing' in g) g.letterSpacing = '0px'; };
    const corValor = v => v < 0 ? COR.vermelho : COR.texto;

    g.fillStyle = COR.fundo; g.fillRect(0, 0, L, H);
    const brilho = g.createRadialGradient(L, 0, 0, L, 0, 760);
    brilho.addColorStop(0, 'rgba(200,242,107,0.16)'); brilho.addColorStop(1, 'rgba(200,242,107,0)');
    g.fillStyle = brilho; g.fillRect(0, 0, L, 760);
    g.fillStyle = COR.acento; g.fillRect(0, 0, L, 12);

    const img = await logo();
    let y = 76;
    if (img) { const h = 40, w = img.width * h / img.height; g.drawImage(img, P, y, w, h); }
    else { fonte(700, 34); texto('WARDEN', P, y + 34, COR.texto); }
    fonte(700, 20); if ('letterSpacing' in g) g.letterSpacing = '4px';
    texto('CONTROL', L - P, y + 30, COR.acento, 'right');
    if ('letterSpacing' in g) g.letterSpacing = '0px';

    y = 220;
    fonte(600, 66, 'Fraunces'); texto(cortar(titulo(d), L - 2 * P), P, y, COR.texto);
    fonte(400, 28); texto(`${N.NOME_PERFIL[d.perfil]} · gerado em ${N.dataBR(d.ref)}`, P, y + 50, COR.fraco);

    // recebido / pago / resultado
    y = 320;
    caixa(P, y, L - 2 * P, 160, 28, COR.card);
    const col = (L - 2 * P) / 3;
    [['Recebido', brl(d.recebido), COR.texto], ['Pago', brl(d.pago), COR.texto],
      ['Resultado', brl(d.resultado, { sinal: true }), d.resultado < 0 ? COR.vermelho : d.resultado > 0 ? COR.acento : COR.texto]
    ].forEach(([r, v, c], i) => {
      const x = P + 32 + i * col;
      rotulo(r, x, y + 58); fonte(600, 38); texto(cortar(v, col - 44), x, y + 112, c);
    });

    // saldo de hoje e fim do mês
    y = 500;
    caixa(P, y, L - 2 * P, 160, 28, COR.card);
    const meio = (L - 2 * P) / 2;
    rotulo('Saldo de hoje', P + 32, y + 58); fonte(600, 46); texto(cortar(brl(d.saldoHoje), meio - 50), P + 32, y + 118, corValor(d.saldoHoje));
    rotulo(d.fimMes ? `${d.fimMes.previsto ? 'Previsto' : 'Saldo'} em ${N.dataCurta(d.fimMes.data)}` : 'Fim do mês', P + meio + 16, y + 58);
    fonte(600, 46);
    texto(d.fimMes ? cortar(brl(d.fimMes.saldo), meio - 50) : '—', P + meio + 16, y + 118, d.fimMes ? corValor(d.fimMes.saldo) : COR.fraco);

    // onde mais gastou
    y = 680 + 60;
    fonte(600, 36, 'Fraunces'); texto('Onde mais gastou', P, y, COR.texto);
    y += 36;
    if (!cats.length) { fonte(400, 28); texto('Nenhum pagamento neste mês ainda.', P, y + 40, COR.fraco); y += 74; }
    const maxCat = cats.length ? cats[0].valor : 1;
    cats.forEach((c, i) => {
      fonte(600, 28); const v = brl(c.valor), wv = g.measureText(v).width;
      texto(v, L - P, y + 34, COR.texto, 'right');
      fonte(400, 28); texto(cortar(c.nome, L - 2 * P - wv - 24), P, y + 34, COR.texto);
      caixa(P, y + 48, L - 2 * P, 10, 5, COR.trilho);
      caixa(P, y + 48, Math.max(10, (L - 2 * P) * c.valor / maxCat), 10, 5, i === 0 ? COR.acento : COR.sutil);
      y += 74;
    });

    // próximas contas
    y += 60;
    fonte(600, 36, 'Fraunces'); texto('Próximas contas', P, y, COR.texto);
    fonte(400, 24); texto('30 dias', L - P, y, COR.fraco, 'right');
    y += 36;
    if (!prox.length) { fonte(400, 28); texto('Nada vencendo nos próximos 30 dias.', P, y + 40, COR.fraco); y += 62; }
    prox.forEach((c, i) => {
      if (i) { g.fillStyle = COR.trilho; g.fillRect(P, y, L - 2 * P, 1); }
      fonte(600, 24); texto(c.atrasada ? 'ATRASADA' : N.dataCurta(c.vencimento), P, y + 40, c.atrasada ? COR.vermelho : COR.fraco);
      fonte(600, 28); const v = `${c.tipo === 'receber' ? '+' : '−'} ${brl(c.valor)}`, wv = g.measureText(v).width;
      texto(v, L - P, y + 40, c.tipo === 'receber' ? COR.acento : COR.texto, 'right');
      fonte(400, 28); texto(cortar(c.descricao, L - 2 * P - 150 - wv - 24), P + 150, y + 40, COR.texto);
      y += 62;
    });
    if (d.proximas.length > prox.length) { fonte(400, 24); texto(`e mais ${d.proximas.length - prox.length} no Warden Control`, P, y + 30, COR.fraco); }

    fonte(400, 22); texto('Gerado com Warden · wardenfinance.com.br', L / 2, H - 52, COR.fraco, 'center');
    return new Promise((ok, falha) => cv.toBlob(b => (b ? ok(b) : falha(new Error('Não consegui gerar a imagem.'))), 'image/png'));
  }

  window.ControlRelatorio = { pdf, imagem, nomeArquivo, carregarKit };
})();
