// Test fixture: the real quotation config with the workflow enabled. Swapped in for
// src/config/quotation.ts only in temporary test builds (tests/worker/quotation-intake.ts);
// the committed config keeps the workflow disabled.
import { quotationWorkflow as realWorkflow } from '../../../src/config/quotation.ts';

export * from '../../../src/config/quotation.ts';

export const QUOTATION_ON = true;
export const quotationWorkflow = { ...realWorkflow, enabled: true as boolean };
