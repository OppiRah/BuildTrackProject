import { describe, expect, it } from 'vitest';
import { disclosure } from '../src/lib/disclosures.ts';

/** Phrases claiming delivery or testing, which neither configuration nor publication proves. */
const UNSUPPORTED_CLAIM =
  /\b(was|were|has been|have been|is|are) (received|delivered|verified|tested|confirmed)\b|\btest request\b/i;

const allText = (formRendered: boolean) => {
  const d = disclosure(formRendered);
  return [...d.working, ...d.stillToCome, d.aboutSite, d.aboutForm, d.estimator, d.payment];
};

describe('disclosure', () => {
  it.each([true, false])('makes no delivery or testing claim (form rendered: %s)', (formRendered) => {
    for (const line of allText(formRendered)) expect(line).not.toMatch(UNSUPPORTED_CLAIM);
  });

  it.each([true, false])('states the human-verified publication and keeps production receipt pending (form rendered: %s)', (formRendered) => {
    const { working, stillToCome, aboutSite, aboutForm } = disclosure(formRendered);
    expect(working).toContain('This website, its pages and navigation, published at a public web address');
    expect(aboutSite).toBe('This website is a working prototype, published at a public web address.');
    expect(stillToCome).not.toContain('Publication at a public web address');
    expect(stillToCome).toContain('Confirming that requests sent from the published website reach the BuildTrack contact');
    if (formRendered) expect(aboutForm).toMatch(/Confirming that requests from the published website arrive is still to come/);
  });

  it('lists the form as working only when it is rendered, without implying it has been tested', () => {
    expect(disclosure(true).working).toContain('An editable request form that starts with your chosen request, service or plan');
    expect(disclosure(true).aboutForm).toMatch(/still to come/);
    expect(disclosure(false).working).not.toContain('An editable request form that starts with your chosen request, service or plan');
    expect(disclosure(false).stillToCome).toContain('Sending requests to the BuildTrack contact');
  });

  it.each([true, false])('keeps the estimate unreviewed and the payment walkthrough simulated, with no provider connected (form rendered: %s)', (formRendered) => {
    const d = disclosure(formRendered);
    expect(d.working.some((line) => /estimate/.test(line) && /not yet reviewed by a civil engineer/.test(line))).toBe(true);
    expect(d.estimator).toMatch(/not yet reviewed by a civil engineer/);
    expect(d.payment).toMatch(/simulation/);
    expect(d.payment).toMatch(/no payment provider is connected/);
    for (const line of allText(formRendered)) {
      expect(line).not.toMatch(/\b(approved|validated|certified) by\b|\bengineer-approved\b/i);
      expect(line).not.toMatch(/\b(accepts|takes|processes) (card )?payments?\b|\bpayment (is|was) (verified|confirmed)\b/i);
    }
  });

  it('takes only whether the form is rendered, never a production URL', () => {
    expect(disclosure.length).toBe(1);
  });
});
