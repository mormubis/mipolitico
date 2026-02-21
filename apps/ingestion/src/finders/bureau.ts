import type { Finder } from '../types.ts';

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();

  await page.goto('https://www.congreso.es/es/opendata/organos');

  await Promise.all([
    page.waitForEvent('load'),
    page.getByText('Exportar datos composición').first().click(),
  ]);

  const [request] = await Promise.all([
    page.waitForEvent('requestfinished', { timeout: 3000 }),
    page.getByText('Composición histórica').first().click(),
  ]);

  const url = request.url();

  await page.close();

  return url;
};

export { finder };
