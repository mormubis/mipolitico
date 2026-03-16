import { Observable } from 'rxjs';
import { z } from 'zod';

import type { Retriever } from '../types.ts';

type Model = z.infer<typeof Schema>;

const Schema = z.object({
  COD_PARLAMENTARIO: z.number(),
  PDF_ACTIVIDADES: z.string().optional(),
  PDF_BIENES_RENTAS: z.string().optional(),
  PDF_INTERESES_ECONOMICOS: z.string().optional(),
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

        const [pdfActividades, pdfBienesRentas, pdfInteresesEconomicos] =
          await Promise.all([
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
          COD_PARLAMENTARIO: codParlamentario,
          PDF_ACTIVIDADES: pdfActividades ?? undefined,
          PDF_BIENES_RENTAS: pdfBienesRentas ?? undefined,
          PDF_INTERESES_ECONOMICOS: pdfInteresesEconomicos ?? undefined,
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
