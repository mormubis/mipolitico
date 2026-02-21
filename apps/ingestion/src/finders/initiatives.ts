import type { Finder } from '../types.ts';

const INITIATIVES_CATEGORIES = [
  'IniciativasLegislativasAprobadas',
  'ProyectosDeLey',
  'PropuestasDeReforma',
  'ProposicionesDeLey',
] as const;

const finder: Finder = async ({ browser }) => {
  const page = await browser.newPage();

  try {
    await page.goto('https://www.congreso.es/es/opendata/iniciativas', {
      waitUntil: 'networkidle',
    });

    const needles = [];

    for (const category of INITIATIVES_CATEGORIES) {
      const link = await page
        .locator(`a[href*="${category}"][href$="json"]`)
        .first()
        .getAttribute('href');

      if (!link) {
        console.warn(
          `[initiatives] Could not find link for category: ${category}`,
        );
        continue;
      }

      const url = new URL(link, 'https://www.congreso.es');
      needles.push({ url: url.href, extra: { category } });
    }

    return needles;
  } finally {
    await page.close();
  }
};

export { finder };
