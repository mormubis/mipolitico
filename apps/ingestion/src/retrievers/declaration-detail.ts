import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  codParlamentario: z.number(),
  name: z.string().min(1),
  pdfActividades: z.string().optional(),
  pdfBienesRentas: z.string().optional(),
  pdfInteresesEconomicos: z.string().optional(),
});

const retriever: Retriever<Model> = ({ browser, url }) => {
  return new Observable<Model>((subscriber) => {
    void (async () => {
      const page = await browser.newPage();

      try {
        await page.goto(url, { waitUntil: 'networkidle' });

        const urlObj = new URL(url);
        const codParlamentario = Number(
          urlObj.searchParams.get('codParlamentario') ?? '0',
        );

        const [name, pdfActividades, pdfBienesRentas, pdfInteresesEconomicos] =
          await Promise.all([
            // The h1 contains "Name - Legislature - Site" (given name first).
            // Use [class*="nombre"] which has "Surname, Name" matching Person.name.
            page
              .locator('[class*="nombre"]')
              .first()
              .textContent()
              .then((t) => (t ?? '').trim()),
            page
              .getByText('Declaración de Actividades')
              .first()
              .getAttribute('href')
              .catch(() => undefined),
            page
              .getByText('Declaración de Bienes y Rentas')
              .first()
              .getAttribute('href')
              .catch(() => undefined),
            page
              .getByText('Declaración de Intereses Económicos')
              .first()
              .getAttribute('href')
              .catch(() => undefined),
          ]);

        subscriber.next({
          codParlamentario,
          name,
          pdfActividades: pdfActividades ?? undefined,
          pdfBienesRentas: pdfBienesRentas ?? undefined,
          pdfInteresesEconomicos: pdfInteresesEconomicos ?? undefined,
        });

        subscriber.complete();
      } catch (cause) {
        subscriber.error(
          new Error(`Failed to process ${url}: ${(cause as Error).message}`, {
            cause,
          }),
        );
      } finally {
        await page.close();
      }
    })();
  });
};

export type { Model };
export { Schema, retriever };
