import type { Finder } from '../types.ts';

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();

  await page.goto('https://www.congreso.es/es/opendata/diputados');

  const link = await page
    .locator('a[href*=DiputadosActivos][href$=json]')
    .getAttribute('href');

  if (!link) {
    throw new Error(
      'Could not find link to active deputies JSON data on the congress page',
    );
  }

  const url = new URL(link, 'https://www.congreso.es');

  await page.close();

  return url.href;
};

export { finder };
