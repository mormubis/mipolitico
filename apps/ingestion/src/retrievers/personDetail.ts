import { Observable } from 'rxjs';
import { z } from 'zod';

import { random } from '../utils.ts';

import type { APIDeputyItem } from '../finders/personDetail.ts';
import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  CIRCUNSCRIPCION: z.number(),
  COD_PARLAMENTARIO: z.number(),
  DECLARACION_ACTIVIDADES_URL: z.string().optional(),
  DECLARACION_BIENES_URL: z.string().optional(),
  DECLARACION_INTERESES_URL: z.string().optional(),
  EMAIL: z.string().optional(),
  FACEBOOK: z.string().optional(),
  FECHA_NACIMIENTO: z.string().optional(),
  FORMACION: z.string(),
  FOTO_URL: z.string(),
  GENERO: z.number(),
  GRUPO: z.string(),
  INSTAGRAM: z.string().optional(),
  LEGISLATURAS: z.array(z.number()),
  LINKEDIN: z.string().optional(),
  NOMBRE: z.string(),
  TWITTER: z.string().optional(),
  WEB: z.string().optional(),
});

const retriever: Retriever<Model> = ({ browser, extra, url }) => {
  return new Observable<Model>((subscriber) => {
    void (async () => {
      const deputy = extra as APIDeputyItem;
      const page = await browser.newPage();

      try {
        await page.goto(url);

        const [
          DECLARACION_ACTIVIDADES_URL,
          DECLARACION_BIENES_URL,
          DECLARACION_INTERESES_URL,
          EMAIL,
          FACEBOOK,
          FECHA_NACIMIENTO,
          FOTO_URL,
          INSTAGRAM,
          LEGISLATURAS,
          LINKEDIN,
          TWITTER,
          WEB,
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
            .getAttribute('href', { timeout: random(1000, 3000) })
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

        subscriber.next({
          CIRCUNSCRIPCION: deputy.idCircunscripcion,
          COD_PARLAMENTARIO: deputy.codParlamentario,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          DECLARACION_ACTIVIDADES_URL: DECLARACION_ACTIVIDADES_URL!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          DECLARACION_BIENES_URL: DECLARACION_BIENES_URL!,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          DECLARACION_INTERESES_URL: DECLARACION_INTERESES_URL!,
          EMAIL,
          FACEBOOK,
          FECHA_NACIMIENTO,
          FORMACION: deputy.formacion,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          FOTO_URL: FOTO_URL!,
          GENERO: deputy.genero,
          GRUPO: deputy.grupo,
          INSTAGRAM,
          LEGISLATURAS,
          LINKEDIN,
          NOMBRE: deputy.apellidosNombre,
          TWITTER,
          WEB,
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
