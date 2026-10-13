// Payment walkthrough for the Product Demo: a simulated academic sequence, never a payment.
// Pure. Fictional quotation → simulated acceptance → card or bank choice → simulated success,
// failure or cancellation. Nothing is collected, sent, charged or verified; no provider is
// contacted. The real inquiry form is independent of this.

export type PaymentStep = 'quotation' | 'declined' | 'method' | 'confirm' | 'result';
export type PaymentMethod = 'card' | 'bank';
export type PaymentOutcome = 'success' | 'failure' | 'cancelled';

export interface PaymentState {
  step: PaymentStep;
  method: PaymentMethod | null;
  outcome: PaymentOutcome | null;
}

export const initialPaymentState: PaymentState = { step: 'quotation', method: null, outcome: null };

export type PaymentAction =
  | { type: 'accept' }
  | { type: 'decline' }
  | { type: 'choose'; method: PaymentMethod }
  | { type: 'back' }
  | { type: 'outcome'; outcome: PaymentOutcome }
  | { type: 'restart' };

/** Moves through the walkthrough; an action that does not fit the current step changes nothing. */
export function reducePayment(state: PaymentState, action: PaymentAction): PaymentState {
  switch (action.type) {
    case 'accept':
      return state.step === 'quotation' ? { step: 'method', method: null, outcome: null } : state;
    case 'decline':
      return state.step === 'quotation' ? { step: 'declined', method: null, outcome: null } : state;
    case 'choose':
      return state.step === 'method' ? { step: 'confirm', method: action.method, outcome: null } : state;
    case 'back':
      return state.step === 'confirm' ? { step: 'method', method: null, outcome: null } : state;
    case 'outcome':
      return state.step === 'confirm' ? { ...state, step: 'result', outcome: action.outcome } : state;
    case 'restart':
      return initialPaymentState;
  }
}

export const methodLabels: Record<PaymentMethod, string> = { card: 'Card (simulated)', bank: 'Bank transfer (simulated)' };

/** Every outcome says it was simulated and that nothing was verified by a payment provider. */
export const outcomeMessages: Record<PaymentOutcome, { title: string; text: string }> = {
  success: {
    title: 'Simulated success',
    text: 'In this simulation the payment is shown as successful. No money moved, nothing was charged, and no payment provider verified anything.',
  },
  failure: {
    title: 'Simulated failure',
    text: 'In this simulation the payment is shown as failed, as a real provider might report a declined card or a failed transfer. No money moved and no provider was contacted.',
  },
  cancelled: {
    title: 'Simulated cancellation',
    text: 'In this simulation the customer cancelled before paying. No money moved and no provider was contacted.',
  },
};

export const stepLabels: Record<Exclude<PaymentStep, 'declined'>, string> = {
  quotation: '1. Quotation',
  method: '2. Payment method',
  confirm: '3. Simulated payment',
  result: '4. Result',
};
