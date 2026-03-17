import { Observable } from 'rxjs';
import { z } from 'zod';

import { random } from '../utils.ts';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  activitiesDeclarationUrl: z.string().optional(),
  assetsDeclarationUrl: z.string().optional(),
  birthDate: z.string().optional(),
  codParlamentario: z.number(),
  constituency: z.number(),
  electoralFormation: z.string().min(1),
  email: z.string().optional(),
  facebook: z.string().optional(),
  gender: z.number(),
  interestsDeclarationUrl: z.string().optional(),
  instagram: z.string().optional(),
  legislatures: z.array(z.number()),
  linkedin: z.string().optional(),
  name: z.string(),
  parliamentaryGroup: z.string(),
  partyName: z.string().optional(),
  photoUrl: z.string(),
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
          activitiesDeclarationUrl,
          assetsDeclarationUrl,
          interestsDeclarationUrl,
          email,
          facebook,
          birthDate,
          photoUrl,
          instagram,
          legislatures,
          linkedin,
          twitter,
          web,
        ] = await Promise.all([
          page
            .getByText('Declaración de Actividades')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .catch((error: unknown) => {
              throw new Error(
                `Failed to extract Declaración de Actividades URL: ${(error as Error).message}`,
              );
            }),
          page
            .getByText('Declaración de Bienes y Rentas')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .catch((error: unknown) => {
              throw new Error(
                `Failed to extract Declaración de Bienes y Rentas URL: ${(error as Error).message}`,
              );
            }),
          page
            .getByText('Declaración de Intereses Económicos')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .catch((error: unknown) => {
              throw new Error(
                `Failed to extract Declaración de Intereses Económicos URL: ${(error as Error).message}`,
              );
            }),
          page
            .locator('a[href^="mailto:"]')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => (link ?? '').replace('mailto:', '')),
          page
            .locator('a:has(img[alt="facebook"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
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
            .locator('img[alt="Card image cap"]')
            .first()
            .getAttribute('src', { timeout: random(1000, 3000) })
            .catch(() => {
              throw new Error('Failed to extract Foto URL');
            }),
          page
            .locator('a:has(img[alt="instagram"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
            .catch(() => undefined),
          page
            .locator('#_diputadomodule_legislaturasDiputado option')
            .all()
            .then((options) =>
              Promise.all(
                options.map((option) =>
                  option
                    .getAttribute('value', { timeout: random(1000, 3000) })
                    .then(Number),
                ),
              ),
            )
            .catch(() => [] as number[]),
          page
            .locator('a:has(img[alt="linkedin"])')
            .first()
            .getAttribute('href', { timeout: random(1000, 3000) })
            .then((link) => link ?? undefined)
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

        const name = await page
          .locator('h1')
          .first()
          .textContent()
          .then((t) => (t ?? '').trim())
          .catch(() => '');

        const parliamentaryGroup = await page
          .locator('.grupo-parlamentario, [class*="grupo"]')
          .first()
          .textContent()
          .then((t) => (t ?? '').trim())
          .catch(() => '');

        const partyName = await page
          .locator('.formacion, [class*="formacion"]')
          .first()
          .textContent()
          .then((t) => (t ?? '').trim())
          .catch(() => '');

        const electoralFormation = await page
          .locator('.siglas-partido')
          .first()
          .textContent()
          .then((t) => (t ?? '').trim())
          .catch(() => '');

        subscriber.next({
          activitiesDeclarationUrl: activitiesDeclarationUrl ?? undefined,
          assetsDeclarationUrl: assetsDeclarationUrl ?? undefined,
          birthDate,
          codParlamentario,
          constituency: 0,
          electoralFormation,
          email,
          facebook,
          gender: 0,
          instagram,
          interestsDeclarationUrl: interestsDeclarationUrl ?? undefined,
          legislatures,
          linkedin,
          name,
          parliamentaryGroup,
          partyName,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          photoUrl: photoUrl!,
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
