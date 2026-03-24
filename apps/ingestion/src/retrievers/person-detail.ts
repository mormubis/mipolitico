import { Observable } from 'rxjs';
import { z } from 'zod';

import { random } from '../utils.ts';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  birthDate: z.string().optional(),
  codParlamentario: z.number(),
  electoralFormation: z.string().min(1),
  email: z.string().optional(),
  facebook: z.string().optional(),
  instagram: z.string().optional(),
  linkedin: z.string().optional(),
  name: z.string(),
  parliamentaryGroup: z.string(),
  partyName: z.string().optional(),
  photoUrl: z.string().optional(),
  twitter: z.string().optional(),
  web: z.string().optional(),
});

const retriever: Retriever<Model> = ({ browser, url }) => {
  return new Observable<Model>((subscriber) => {
    void (async () => {
      const urlObj = new URL(url);
      const codParlamentario = Number(
        urlObj.searchParams.get('codParlamentario') ?? '0',
      );

      const page = await browser.newPage();

      try {
        await page.goto(url, { waitUntil: 'networkidle' });

        const [
          birthDate,
          electoralFormation,
          email,
          facebook,
          instagram,
          linkedin,
          name,
          parliamentaryGroup,
          partyName,
          photoUrl,
          twitter,
          web,
        ] = await Promise.all([
          page
            .locator('text=/Nacid[oa] el/')
            .first()
            .textContent({ timeout: random(1000, 3000) })
            .then((textContent) => {
              const [date = undefined] =
                /\d{2}\/\d{2}\/\d{4}/.exec(textContent ?? '') ?? [];
              return date;
            })
            .catch(() => undefined),
          page
            .locator('.siglas-partido')
            .first()
            .textContent()
            .then((t) => (t ?? '').trim())
            .catch(() => ''),
          page
            .locator('a[href^="mailto:"]')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => (link ?? '').replace('mailto:', ''))
            .catch(() => undefined),
          page
            .locator('a:has(img[alt="facebook"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
          page
            .locator('a:has(img[alt="instagram"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
          page
            .locator('a:has(img[alt="linkedin"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
          // The h1 contains "Name - Legislature - Site" — use the .nombre class
          // which has the canonical "Surname, Name" format matching Person.name
          page
            .locator('[class*="nombre"]')
            .first()
            .textContent()
            .then((t) => (t ?? '').trim())
            .catch(() => ''),
          page
            .locator('.grupo-parlamentario, [class*="grupo"]')
            .first()
            .textContent()
            .then((t) => (t ?? '').trim())
            .catch(() => ''),
          page
            .locator('.formacion, [class*="formacion"]')
            .first()
            .textContent()
            .then((t) => (t ?? '').trim())
            .catch(() => ''),
          page
            .locator('img[alt="Card image cap"]')
            .first()
            .getAttribute('src', { timeout: random(1000, 3000) })
            .catch(() => undefined),
          page
            .locator('a:has(img[alt="twitter"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
          page
            .locator('a:has(img[alt="personal-web"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
        ]);

        subscriber.next({
          birthDate,
          codParlamentario,
          electoralFormation,
          email,
          facebook,
          instagram,
          linkedin,
          name,
          parliamentaryGroup,
          partyName,
          photoUrl: photoUrl ?? undefined,
          twitter,
          web,
        });

        subscriber.complete();
      } catch (cause) {
        const error = new Error(
          `Unable to parse ${url}: ${(cause as Error).message}`,
          { cause },
        );
        subscriber.error(error);
      } finally {
        await page.close();
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };
