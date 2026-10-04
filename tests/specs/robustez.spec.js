// Robustez nas 29 ferramentas: cada campo recebe vazio, zero, negativo, letras, número gigante, vírgula e ponto.
// A página nunca pode mostrar NaN, Infinity, "undefined", "[object …]" ou notação científica, nem dar erro no console.
const { test, expect } = require('@playwright/test');
const { abrir, semErros } = require('../helpers');
const { FERRAMENTAS } = require('../ferramentas');

const VALORES_TEXTO = ['', '0', '-5', 'abc', '999999999', '1.234,56', '1,5', '1.5'];
const VALORES_NUMERO = ['', '0', '-5', '999999999', '1.5'];   // campo type=number não aceita letras (o navegador bloqueia)
const VALORES_DATA = ['', '1900-01-01', '2099-12-31'];

// procura textos proibidos no que está visível na tela (inclui cards, notas e tabelas)
async function problemas(page, escopo) {
  return page.evaluate(sel => {
    const raiz = document.querySelector(sel) || document.body;
    const texto = raiz.innerText;
    const achados = [];
    for (const [nome, re] of [['NaN', /\bNaN\b/], ['Infinity', /Infinity/], ['undefined', /\bundefined\b/], ['[object', /\[object /], ['notação científica', /\d(\.\d+)?e[+-]\d/]]) {
      const m = texto.match(re);
      if (m) achados.push(`${nome}: "…${texto.slice(Math.max(0, m.index - 60), m.index + 40).replace(/\s+/g, ' ')}…"`);
    }
    return achados;
  }, escopo);
}

for (const f of FERRAMENTAS) {
  test.describe(f.slug, () => {
    test('robustez: entradas vazias, zero, negativas, letras e gigantes não quebram a página', async ({ page }) => {
      test.setTimeout(240_000);
      const erros = await abrir(page, f.url);
      const escopo = 'body';
      const sel = ['input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file])', 'textarea']
        .map(s => `${escopo} ${s}`).join(', ');
      const campos = await page.locator(sel).all();
      const falhas = [];
      for (const campo of campos) {
        if (!(await campo.isVisible()) || !(await campo.isEditable())) continue;
        const id = (await campo.getAttribute('id')) || (await campo.getAttribute('class')) || '?';
        const tipo = (await campo.getAttribute('type')) || 'text';
        const original = await campo.inputValue();
        const valores = tipo === 'number' ? VALORES_NUMERO : tipo === 'date' ? VALORES_DATA : VALORES_TEXTO;
        for (const v of valores) {
          try { await campo.fill(v); } catch (e) { continue; }   // valor que o próprio navegador recusa
          await campo.dispatchEvent('change');
          await campo.blur();
          for (const p of await problemas(page, escopo)) falhas.push(`campo ${id} = "${v}" → ${p}`);
        }
        await campo.fill(original); await campo.dispatchEvent('change');
      }
      // todos os campos vazios de uma vez
      for (const campo of campos) if (await campo.isVisible() && await campo.isEditable()) { try { await campo.fill(''); await campo.dispatchEvent('change'); } catch (e) {} }
      for (const p of await problemas(page, escopo)) falhas.push(`todos os campos vazios → ${p}`);

      expect(campos.length, 'a ferramenta tem campos').toBeGreaterThan(0);
      expect(falhas, falhas.join('\n')).toEqual([]);
      semErros(erros);
    });
  });
}
