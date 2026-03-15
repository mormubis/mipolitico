import { Observable } from 'rxjs';

import { random } from '../utils.ts';

import type { Retriever } from '../types.ts';
import type { InterestDeclarationInput } from '@congress/database';

interface BulkDeclarationRow {
  NOMBRE: string;
  FECHAREGISTRO: string;
  DECLARACION: string;
  TIPO: string;
  PERIODO: string;
  EMPLEADOR: string;
  SECTOR: string;
  DESCRIPCION: string;
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/,\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function parsePeriodToDate(year: string): string {
  return `${year.trim()}-01-01`;
}

function parsePeriod(periodo: string): {
  startDate?: string;
  endDate?: string;
} {
  const parts = periodo
    .split('-')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0 || parts[0] === undefined) return {};
  if (parts.length === 1) return { startDate: parsePeriodToDate(parts[0]) };

  const last = parts[parts.length - 1];

  return {
    startDate: parsePeriodToDate(parts[0]),
    endDate: last !== undefined ? parsePeriodToDate(last) : undefined,
  };
}

function mapActivities(
  rows: BulkDeclarationRow[],
): NonNullable<InterestDeclarationInput['PROFESSIONAL_ACTIVITIES']> {
  return rows
    .filter((r) => r.TIPO === 'ACTIVIDAD')
    .map((r) => ({
      entity: r.EMPLEADOR,
      position: r.DESCRIPCION,
      remunerated: r.SECTOR !== 'PÚBLICO',
      ...parsePeriod(r.PERIODO),
    }));
}

const retriever: Retriever<InterestDeclarationInput> = ({
  browser,
  fetch,
  url,
}) =>
  new Observable((subscriber) => {
    void (async () => {
      try {
        // Download the bulk declarations JSON
        const response = await fetch(url);

        if (!response.ok) {
          subscriber.error(
            new Error(
              `[interestDeclarations] Failed to fetch docacteco JSON: ${response.status.toString()} ${response.statusText}`,
            ),
          );
          return;
        }

        const rows = (await response.json()) as BulkDeclarationRow[];

        // Group rows by normalised NOMBRE
        const rowsByName = new Map<string, BulkDeclarationRow[]>();
        for (const row of rows) {
          const key = normalizeName(row.NOMBRE);
          const existing = rowsByName.get(key) ?? [];
          existing.push(row);
          rowsByName.set(key, existing);
        }

        // For each deputy group, scrape their profile page for the PDF URL
        for (const [normalizedName, deputyRows] of rowsByName) {
          const page = await browser.newPage();

          try {
            // Use a name-based search URL
            const searchUrl = `https://www.congreso.es/es/busqueda-de-diputados?p_p_id=diputadomodule&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_diputadomodule_mostrarFicha=S&nombre=${encodeURIComponent(normalizedName)}`;

            await page.goto(searchUrl, { waitUntil: 'networkidle' });

            const pdfUrl = await page
              .getByText('Declaración de Intereses Económicos')
              .first()
              .getAttribute('href', { timeout: random(1000, 3000) })
              .catch(() => undefined);

            const activities = mapActivities(deputyRows);

            subscriber.next({
              DEPUTY_ID: normalizedName,
              PDF_URL: pdfUrl ?? undefined,
              PROFESSIONAL_ACTIVITIES:
                activities.length > 0 ? activities : undefined,
              YEAR: new Date().getFullYear(),
            });
          } catch (cause) {
            console.warn(
              `[validate] Skipping deputy ${normalizedName}: ${(cause as Error).message}`,
            );
          } finally {
            await page.close().catch(() => undefined);
          }
        }

        subscriber.complete();
      } catch (cause) {
        subscriber.error(
          new Error(`Failed to process ${url}: ${(cause as Error).message}`, {
            cause,
          }),
        );
      }
    })();
  });

export type { BulkDeclarationRow };
export { retriever };
