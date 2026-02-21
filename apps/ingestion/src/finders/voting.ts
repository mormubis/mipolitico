import type { Finder } from '../types.ts';

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();
  const needles = [];

  try {
    await page.goto('https://www.congreso.es/es/opendata/votaciones', {
      waitUntil: 'networkidle',
    });

    const sections = await page.locator('h4[role="button"]').all();
    for (const section of sections) {
      await section.click();
      await page.waitForTimeout(300);
    }

    const jsonLinks = await page.locator('a[href$=".json"]').all();

    for (const link of jsonLinks) {
      const href = await link.getAttribute('href');
      if (href) {
        const match = /Leg(\d+)\/Sesion(\d+)/.exec(href);
        needles.push({
          url: href,
          extra: {
            legislature: match?.[1] ? parseInt(match[1], 10) : null,
            session: match?.[2] ? parseInt(match[2], 10) : null,
          },
        });
      }
    }

    return needles;
  } finally {
    await page.close();
  }
};

export { finder };
