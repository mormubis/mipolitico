import { chromium } from 'playwright';
import { firstValueFrom, lastValueFrom, take, toArray } from 'rxjs';

import { finder as bureauFinder } from '../finders/bureau.ts';
import { finder as initiativesFinder } from '../finders/initiatives.ts';
import { finder as interestDeclarationsFinder } from '../finders/interest-declarations.ts';
import { finder as personFinder } from '../finders/person.ts';
import { finder as votingFinder } from '../finders/voting.ts';
import { retriever as bureauRetriever } from '../retrievers/bureau.ts';
import { retriever as initiativesRetriever } from '../retrievers/initiatives.ts';
import { retriever as interestDeclarationsRetriever } from '../retrievers/interest-declarations.ts';
import { retriever as interventionRetriever } from '../retrievers/intervention.ts';
import { retriever as personRetriever } from '../retrievers/person.ts';
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
    // person — run finder to get fresh timestamped URL
    // -----------------------------------------------------------------------
    console.log('\n[person] resolving url via finder...');
    let personUrl: string | null = null;
    try {
      personUrl = await firstValueFrom(personFinder(opts));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        retriever: 'person',
        message: `finder failed: ${message}`,
      });
      console.error(`  FAIL (finder): ${message}`);
    }

    console.log('\n[person]');
    const personRecords = personUrl
      ? await run('person', () =>
          lastValueFrom(
            personRetriever({ ...opts, url: personUrl }).pipe(
              take(5),
              toArray(),
            ),
          ),
        )
      : [];
    assert(
      'person',
      personRecords.length >= 1,
      'should emit at least 1 record',
    );
    for (const r of personRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'person',
        typeof rec.NOMBRE === 'string' && rec.NOMBRE.length > 0,
        'NOMBRE should be a non-empty string',
      );
      assert(
        'person',
        typeof rec.FORMACIONELECTORAL === 'string',
        'FORMACIONELECTORAL should be a string',
      );
      assert(
        'person',
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
    // initiatives — run finder to get fresh timestamped URL, take first
    // -----------------------------------------------------------------------
    console.log('\n[initiatives] resolving url via finder...');
    let initiativesUrl: string | null = null;
    try {
      initiativesUrl = await firstValueFrom(initiativesFinder(opts));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        retriever: 'initiatives',
        message: `finder failed: ${message}`,
      });
      console.error(`  FAIL (finder): ${message}`);
    }

    if (initiativesUrl) {
      console.log('\n[initiatives]');
      const initiativesRecords = await run('initiatives', () =>
        lastValueFrom(
          initiativesRetriever({ ...opts, url: initiativesUrl }).pipe(
            take(5),
            toArray(),
          ),
        ),
      );
      assert(
        'initiatives',
        initiativesRecords.length >= 1,
        'should emit at least 1 record',
      );
      for (const r of initiativesRecords) {
        const rec = r as Record<string, unknown>;
        assert(
          'initiatives',
          typeof rec.LEGISLATURE === 'number',
          'LEGISLATURE should be a number',
        );
        assert(
          'initiatives',
          typeof rec.TIPO === 'string' && rec.TIPO.length > 0,
          'TIPO should be a non-empty string',
        );
        // Records are either ParliamentaryInitiativeInput (has OBJETO) or
        // ApprovedLawInput (has TITULO_LEY) — check the union-level invariant.
        assert(
          'initiatives',
          (typeof rec.OBJETO === 'string' && rec.OBJETO.length > 0) ||
            (typeof rec.TITULO_LEY === 'string' && rec.TITULO_LEY.length > 0),
          'record should have either OBJETO (parliamentary) or TITULO_LEY (approved law)',
        );
      }
    }

    // -----------------------------------------------------------------------
    // interest-declarations — run finder to get the docacteco JSON URL
    // Note: the retriever calls fetch(url) directly on the bulk JSON endpoint,
    // so we must use the URL the finder resolves (not the opendata page itself).
    // We use take(1) to avoid processing all deputies in the integration test.
    // -----------------------------------------------------------------------
    console.log('\n[interest-declarations] resolving url via finder...');
    let interestDeclarationsUrl: string | null = null;
    try {
      interestDeclarationsUrl = await firstValueFrom(
        interestDeclarationsFinder(opts),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({
        retriever: 'interest-declarations',
        message: `finder failed: ${message}`,
      });
      console.error(`  FAIL (finder): ${message}`);
    }

    console.log('\n[interest-declarations]');
    const interestRecords = interestDeclarationsUrl
      ? await run('interest-declarations', () =>
          lastValueFrom(
            interestDeclarationsRetriever({
              ...opts,
              url: interestDeclarationsUrl,
            }).pipe(take(1), toArray()),
          ),
        )
      : [];
    assert(
      'interest-declarations',
      interestRecords.length === 1,
      'should emit at least 1 record',
    );
    for (const r of interestRecords) {
      const rec = r as Record<string, unknown>;
      assert(
        'interest-declarations',
        typeof rec.nombre === 'string' && rec.nombre.length > 0,
        'nombre should be a non-empty string',
      );
      assert(
        'interest-declarations',
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
