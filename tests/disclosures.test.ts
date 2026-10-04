import { describe, expect, it } from 'vitest';
import { disclosure } from '../src/lib/disclosures.ts';

/** Phrases that would claim verification or publication, which configuration alone cannot prove. */
const UNSUPPORTED_CLAIM =
  /\b(was|were|has been|have been|is) (received|delivered|verified|tested|confirmed|published|deployed|live)\b|\btest request\b|\bpublished at\b|\bnow live\b/i;

const allText = (formRendered: boolean) => {
  const d = disclosure(formRendered);
  return [...d.working, ...d.stillToCome, d.aboutSite, d.aboutForm];
};

describe('disclosure', () => {
  it.each([true, false])('makes no verification or publication claim (form rendered: %s)', (formRendered) => {
    for (const line of allText(formRendered)) expect(line).not.toMatch(UNSUPPORTED_CLAIM);
  });

  it.each([true, false])('keeps publication and production receipt pending whatever the config (form rendered: %s)', (formRendered) => {
    const { stillToCome, aboutSite } = disclosure(formRendered);
    expect(stillToCome).toContain('Publication at a public web address');
    expect(stillToCome).toContain('Confirming that requests sent from the published website reach the BuildTrack contact');
    expect(aboutSite).toMatch(/still to come/);
  });

  it('lists the form as working only when it is rendered, without implying it has been tested', () => {
    expect(disclosure(true).working).toContain('An editable request form that starts with your chosen request, service or plan');
    expect(disclosure(true).aboutForm).toMatch(/still to come/);
    expect(disclosure(false).working).not.toContain('An editable request form that starts with your chosen request, service or plan');
    expect(disclosure(false).stillToCome).toContain('Sending requests to the BuildTrack contact');
  });

  it('takes only whether the form is rendered, never a production URL', () => {
    expect(disclosure.length).toBe(1);
  });
});
