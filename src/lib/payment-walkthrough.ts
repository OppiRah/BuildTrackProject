// Payment demo walkthrough (/payment-demo/): a simulated academic sequence, never a payment.
// Pure. Sample quotation (owner) → quotation email preview → customer accepts or declines →
// payment-invitation email preview → card or bank choice → fictional checkout illustration →
// simulated success, failure or cancellation. Nothing is collected, sent, charged or verified; no
// email is sent and no provider is contacted. The real inquiry form is independent of this.

export type PaymentStep = 'quotation' | 'quoteEmail' | 'decision' | 'declined' | 'invite' | 'method' | 'checkout' | 'result';
export type PaymentMethod = 'card' | 'bank';
export type PaymentOutcome = 'success' | 'failure' | 'cancelled';

export interface PaymentState {
  step: PaymentStep;
  method: PaymentMethod | null;
  outcome: PaymentOutcome | null;
}

export const initialPaymentState: PaymentState = { step: 'quotation', method: null, outcome: null };

export type PaymentAction =
  | { type: 'next' }
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'choose'; method: PaymentMethod }
  | { type: 'back' }
  | { type: 'outcome'; outcome: PaymentOutcome }
  | { type: 'restart' };

/** Where "next" leads from the steps that simply continue. */
const nextStep: Partial<Record<PaymentStep, PaymentStep>> = { quotation: 'quoteEmail', quoteEmail: 'decision', invite: 'method' };

/** Moves through the walkthrough; an action that does not fit the current step changes nothing. */
export function reducePayment(state: PaymentState, action: PaymentAction): PaymentState {
  switch (action.type) {
    case 'next': {
      const step = nextStep[state.step];
      return step ? { step, method: null, outcome: null } : state;
    }
    case 'accept':
      return state.step === 'decision' ? { step: 'invite', method: null, outcome: null } : state;
    case 'decline':
      return state.step === 'decision' ? { step: 'declined', method: null, outcome: null } : state;
    case 'choose':
      return state.step === 'method' ? { step: 'checkout', method: action.method, outcome: null } : state;
    case 'back':
      return state.step === 'checkout' ? { step: 'method', method: null, outcome: null } : state;
    case 'outcome':
      return state.step === 'checkout' ? { ...state, step: 'result', outcome: action.outcome } : state;
    case 'restart':
      return initialPaymentState;
  }
}

export const methodLabels: Record<PaymentMethod, string> = { card: 'Card (simulated)', bank: 'Bank transfer (simulated)' };

/** What a provider's own page would do for each method; the illustration itself has no fields. */
export const checkoutNotes: Record<PaymentMethod, string> = {
  card: "In a real process the customer would type card details only on the payment provider's own secure page, never on BuildTrack. This illustration has no fields and asks for nothing.",
  bank: "In a real process the customer would choose their bank on the payment provider's page and approve the payment on the bank's own site. This illustration gives no bank details or transfer instructions.",
};

/** Shown with every result. */
export const resultDisclaimer = 'Simulated—no money moved. Not a payment receipt.';

/** Every outcome says it was simulated and that nothing was verified by a payment provider. */
export const outcomeMessages: Record<PaymentOutcome, { title: string; text: string }> = {
  success: {
    title: 'Simulated success',
    text: 'In this simulation the payment is shown as successful. Nothing was charged, and no payment provider verified anything.',
  },
  failure: {
    title: 'Simulated failure',
    text: 'In this simulation the payment is shown as failed, as a real provider might report a declined card or a failed transfer. No provider was contacted.',
  },
  cancelled: {
    title: 'Simulated cancellation',
    text: 'In this simulation the customer cancelled before paying. No provider was contacted.',
  },
};

/** The progress list; a declined quotation stays at the customer's decision. */
export const stepLabels: Record<Exclude<PaymentStep, 'declined'>, string> = {
  quotation: '1. Quotation',
  quoteEmail: '2. Quotation email',
  decision: '3. Customer decision',
  invite: '4. Payment invitation',
  method: '5. Payment method',
  checkout: '6. Checkout',
  result: '7. Result',
};
