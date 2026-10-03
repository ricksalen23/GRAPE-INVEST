// Configuração dos testes da Warden.
// - Serve a pasta do projeto (raiz = GRAPE-INVEST) em http://localhost:8765, como o Live Server.
// - Usa o Google Chrome instalado na máquina (channel: 'chrome'), sem baixar navegadores do Playwright.
// - Relatórios: lista no terminal + JSON (base do RELATORIO.md) + HTML navegável em relatorio-html/.
const { defineConfig } = require('@playwright/test');

const PORTA = 8765;

module.exports = defineConfig({
  testDir: './specs',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: 'resultados/resultados.json' }],
    ['html', { outputFolder: 'relatorio-html', open: 'never' }]
  ],
  use: {
    baseURL: `http://localhost:${PORTA}`,
    channel: 'chrome',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure'
  },
  webServer: {
    // -c-1 desliga o cache; -s silencioso
    command: `npx http-server .. -p ${PORTA} -c-1 -s`,
    url: `http://localhost:${PORTA}/index.html`,
    reuseExistingServer: true,
    timeout: 60_000
  }
});
