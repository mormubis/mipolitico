import { chromium } from 'playwright';
import { firstValueFrom, lastValueFrom, take, toArray } from 'rxjs';

import { finder as bureauFinder } from '../finders/bureau.ts';
import { finder as declarationFinder } from '../finders/declaration.ts';
import { finder as deputyFinder } from '../finders/deputy.ts';
import { finder as initiativeFinder } from '../finders/initiative.ts';
import { finder as votingFinder } from '../finders/voting.ts';
import { retriever as bureauRetriever } from '../retrievers/bureau.ts';
import { retriever as declarationRetriever } from '../retrievers/declaration.ts';
import { retriever as deputyRetriever } from '../retrievers/deputy.ts';
import { retriever as initiativeRetriever } from '../retrievers/initiative.ts';
import { retriever as interventionRetriever } from '../retrievers/intervention.ts';
import { retriever as votingRetriever } from '../retrievers/voting.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface AssertionError {
  retriever: string;
  message: string;
}

const errors: AssertionError[] = [];

function assert(retriever: string, condition: boolean, message: string): void {
  if (!condition) {
    errors.push({ retriever, message });
    console.error(`  FAIL: ${message}`);
  }
}

async function run<T>(label: string, fn: () => Promise<T[]>): Promise<T[]> {
  const start = Date.now();
  try {
    const records = await fn();
    const elapsed = Date.now() - start;
    console.log(
      `  PASS (${elapsed.toString()}ms) — ${records.length.toString()} record(s)`,
    );
    return records;
  } catch (err) {
    const elapsed = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    errors.push({ retriever: label, message });
    console.error(`  FAIL (${elapsed.toString()}ms): ${message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Hardcoded stable URLs
// ---------------------------------------------------------------------------

const INTERVENTION_URL =
  'https://www.congreso.es/busqueda-de-intervenciones?p_p_id=intervenciones&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_intervenciones_mode=mostrarTextoIntegro&_intervenciones_legislatura=XV&_intervenciones_id_texto=(DSCD-15-CO-492.CODI.)#(P%C3%A1gina2)';

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const browser = await chromium.launch();

  try {
    const opts = {
      browser,
      fetch: globalThis.fetch,
      sourceName: 'test',
      validationMode: 'strict' as const,
    };

    // -----------------------------------------------------------------------
    // deputy — run finder to get fresh timestamped URL
    // -----------------------------------------------------------------------
    console.log('\n[deputy] resolving url via finder...');
    let deputyUrl: string | null = null;
    try {
      deputyUrl = await firstValueFrom(deputyFinder(opts));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        retriever: 'deputy',
        message: `finder failed: ${message}`,
      });
      console.error(`  FAIL (finder): ${message}`);
    }

    console.log('\n[deputy]');
    const deputyRecords = deputyUrl
      ? await run('deputy', () =>
          lastValueFrom(
            deputyRetriever({ ...opts, url: deputyUrl }).pipe(
              take(5),
              toArray(),
            ),
          ),
        )
      : [];
    assert(
      'deputy',
      deputyRecords.length >= 1,
      'should emit at least 1 record',
    );
    for (const r of deputyRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'deputy',
        typeof rec.NOMBRE === 'string' && rec.NOMBRE.length > 0,
        'NOMBRE should be a non-empty string',
      );
      assert(
        'deputy',
        typeof rec.FORMACIONELECTORAL === 'string',
        'FORMACIONELECTORAL should be a string',
      );
      assert(
        'deputy',
        typeof rec.GRUPOPARLAMENTARIO === 'string',
        'GRUPOPARLAMENTARIO should be a string',
      );
    }

    // -----------------------------------------------------------------------
    // voting — run finder to get a real session URL
    // -----------------------------------------------------------------------
    console.log('\n[voting] resolving url via finder...');
    let votingUrl: string | null = null;
    try {
      const raw = await firstValueFrom(votingFinder(opts));
      votingUrl = raw.startsWith('/') ? `https://www.congreso.es${raw}` : raw;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        retriever: 'voting',
        message: `finder failed: ${message}`,
      });
      console.error(`  FAIL (finder): ${message}`);
    }

    console.log('\n[voting]');
    const votingRecords = votingUrl
      ? await run('voting', () =>
          lastValueFrom(
            votingRetriever({ ...opts, url: votingUrl }).pipe(
              take(5),
              toArray(),
            ),
          ),
        )
      : [];
    assert(
      'voting',
      votingRecords.length >= 1,
      'should emit at least 1 record',
    );
    for (const r of votingRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'voting',
        typeof rec.LEGISLATURE === 'number',
        'LEGISLATURE should be a number',
      );
      assert(
        'voting',
        typeof rec.VOTING_DATE === 'string' && rec.VOTING_DATE.length > 0,
        'VOTING_DATE should be a non-empty string',
      );
      assert('voting', typeof rec.VOTE === 'string', 'VOTE should be a string');
      assert(
        'voting',
        typeof rec.JSON_URL === 'string',
        'JSON_URL should be a string',
      );
    }

    // -----------------------------------------------------------------------
    // bureau — run finder to capture POST URL
    // -----------------------------------------------------------------------
    console.log('\n[bureau] resolving url via finder...');
    let bureauUrl: string | null = null;
    try {
      bureauUrl = await firstValueFrom(bureauFinder(opts));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        retriever: 'bureau',
        message: `finder failed: ${message}`,
      });
      console.error(`  FAIL (finder): ${message}`);
    }

    console.log('\n[bureau]');
    const bureauRecords = bureauUrl
      ? await run('bureau', () =>
          lastValueFrom(
            bureauRetriever({ ...opts, url: bureauUrl }).pipe(
              take(5),
              toArray(),
            ),
          ),
        )
      : [];
    assert(
      'bureau',
      bureauRecords.length >= 1,
      'should emit at least 1 record',
    );
    for (const r of bureauRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'bureau',
        typeof rec.apellidosNombre === 'string' &&
          rec.apellidosNombre.length > 0,
        'apellidosNombre should be a non-empty string',
      );
      assert(
        'bureau',
        typeof rec.descCargo === 'string' && rec.descCargo.length > 0,
        'descCargo should be a non-empty string',
      );
      assert(
        'bureau',
        typeof rec.fechaAltaFormat === 'string',
        'fechaAltaFormat should be a string',
      );
      assert(
        'bureau',
        typeof rec.siglas === 'string',
        'siglas should be a string',
      );
    }

    // -----------------------------------------------------------------------
    // intervention — hardcoded stable URL
    // -----------------------------------------------------------------------
    console.log('\n[intervention]');
    const interventionRecords = await run('intervention', () =>
      lastValueFrom(
        interventionRetriever({ ...opts, url: INTERVENTION_URL }).pipe(
          take(5),
          toArray(),
        ),
      ),
    );
    assert(
      'intervention',
      interventionRecords.length >= 1,
      'should emit at least 1 record',
    );
    for (const r of interventionRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'intervention',
        typeof rec.SESSION_ID === 'string' && rec.SESSION_ID.length > 0,
        'SESSION_ID should be a non-empty string',
      );
      assert(
        'intervention',
        typeof rec.SPEAKER === 'string' && rec.SPEAKER.length > 0,
        'SPEAKER should be a non-empty string',
      );
      assert(
        'intervention',
        typeof rec.TEXT === 'string' && rec.TEXT.length > 0,
        'TEXT should be a non-empty string',
      );
    }

    // -----------------------------------------------------------------------
    // initiative — run finder to get fresh timestamped URL, take first
    // -----------------------------------------------------------------------
    console.log('\n[initiative] resolving url via finder...');
    let initiativeUrl: string | null = null;
    try {
      initiativeUrl = await firstValueFrom(initiativeFinder(opts));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        retriever: 'initiative',
        message: `finder failed: ${message}`,
      });
      console.error(`  FAIL (finder): ${message}`);
    }

    if (initiativeUrl) {
      console.log('\n[initiative]');
      const initiativeRecords = await run('initiative', () =>
        lastValueFrom(
          initiativeRetriever({ ...opts, url: initiativeUrl }).pipe(
            take(5),
            toArray(),
          ),
        ),
      );
      assert(
        'initiative',
        initiativeRecords.length >= 1,
        'should emit at least 1 record',
      );
      for (const r of initiativeRecords) {
        const rec = r as Record<string, unknown>;
        assert(
          'initiative',
          typeof rec.LEGISLATURE === 'number',
          'LEGISLATURE should be a number',
        );
        assert(
          'initiative',
          typeof rec.TIPO === 'string' && rec.TIPO.length > 0,
          'TIPO should be a non-empty string',
        );
        // Records are either ParliamentaryInitiativeInput (has OBJETO) or
        // ApprovedLawInput (has TITULO_LEY) — check the union-level invariant.
        assert(
          'initiative',
          (typeof rec.OBJETO === 'string' && rec.OBJETO.length > 0) ||
            (typeof rec.TITULO_LEY === 'string' && rec.TITULO_LEY.length > 0),
          'record should have either OBJETO (parliamentary) or TITULO_LEY (approved law)',
        );
      }
    }

    // -----------------------------------------------------------------------
    // declaration — run finder to get the docacteco JSON URL
    // Note: the retriever calls fetch(url) directly on the bulk JSON endpoint,
    // so we must use the URL the finder resolves (not the opendata page itself).
    // We use take(1) to avoid processing all deputies in the integration test.
    // -----------------------------------------------------------------------
    console.log('\n[declaration] resolving url via finder...');
    let declarationUrl: string | null = null;
    try {
      declarationUrl = await firstValueFrom(declarationFinder(opts));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        retriever: 'declaration',
        message: `finder failed: ${message}`,
      });
      console.error(`  FAIL (finder): ${message}`);
    }

    console.log('\n[declaration]');
    const interestRecords = declarationUrl
      ? await run('declaration', () =>
          lastValueFrom(
            declarationRetriever({
              ...opts,
              url: declarationUrl,
            }).pipe(take(1), toArray()),
          ),
        )
      : [];
    assert(
      'declaration',
      interestRecords.length === 1,
      'should emit at least 1 record',
    );
    for (const r of interestRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'declaration',
        typeof rec.nombre === 'string' && rec.nombre.length > 0,
        'nombre should be a non-empty string',
      );
      assert(
        'declaration',
        typeof rec.tipo === 'string',
        'tipo should be a string',
      );
    }
  } finally {
    await browser.close();
  }

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  console.log('\n---');
  if (errors.length === 0) {
    console.log('All retrievers passed.');
  } else {
    console.error(`${errors.length.toString()} assertion(s) failed:`);
    for (const e of errors) {
      console.error(`  [${e.retriever}] ${e.message}`);
    }
    process.exitCode = 1;
  }
}

void main().catch((err: unknown) => {
  console.error('Unexpected error:', err);
  process.exitCode = 1;
});
