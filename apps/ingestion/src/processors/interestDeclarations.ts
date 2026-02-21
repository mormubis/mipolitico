import { identity } from 'rxjs';

import type { Processor } from '../types.ts';
import type { InterestDeclarationInput } from '@congress/database';

/**
 * Identity processor for interest declarations.
 *
 * Currently passes records through unchanged. In the future, this processor
 * will download the PDF at PDF_URL and extract structured financial data
 * (real estate, bank accounts, securities, income sources) to populate the
 * full InterestDeclarationInput schema.
 */
const processor: Processor<InterestDeclarationInput> = identity;

export { processor };
