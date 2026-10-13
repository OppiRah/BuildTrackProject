// Product Demo tools: the concrete estimate (a working academic calculation, exact decimal
// arithmetic in src/lib/concrete-estimate.ts). In-memory only: no storage, timers or network
// requests. The visitor's last calculation stays while they switch sections; the demo's Reset (the
// "demo:reset" event from src/scripts/demo.ts) or a reload restores the example values. It neither
// reads nor changes the tracking sections.

import {
  breakdown,
  compare,
  decimal,
  defaultEstimateInput,
  estimate,
  estimateFields,
  parseEstimate,
  showDuration,
  showQuantity,
  sketch,
  type EstimateInput,
} from '../lib/concrete-estimate.ts';

export function initDemoTools(): void {
  const root = document.querySelector<HTMLElement>('[data-demo]');
  if (!root) return;
  const status = root.querySelector<HTMLElement>('[data-demo-status]');
  const announce = (message: string) => {
    if (status) status.textContent = message;
  };
  for (const el of root.querySelectorAll<HTMLElement>('[data-tools-nojs]')) el.hidden = true;
  const resetEstimate = initEstimate(root, announce);
  root.addEventListener('demo:reset', resetEstimate);
}

function initEstimate(root: HTMLElement, announce: (message: string) => void): () => void {
  const form = root.querySelector<HTMLFormElement>('[data-estimate-form]');
  const errorBox = root.querySelector<HTMLElement>('[data-estimate-errors]');
  const errorList = root.querySelector<HTMLElement>('[data-estimate-error-list]');
  if (!form || !errorBox || !errorList) return () => {};
  const inputs = new Map(estimateFields.map((f) => [f.key, form.querySelector<HTMLInputElement>(`[data-estimate-input="${f.key}"]`)!]));
  const errors = new Map(estimateFields.map((f) => [f.key, form.querySelector<HTMLElement>(`[data-estimate-error="${f.key}"]`)!]));
  for (const input of inputs.values()) input.disabled = false;
  const out = (key: string) => root.querySelector<HTMLElement>(`[data-estimate-out="${key}"]`)!;
  const resultState = root.querySelector<HTMLElement>('[data-estimate-result-state]')!;
  let calculated = { ...defaultEstimateInput };
  const readInputs = () => Object.fromEntries([...inputs].map(([key, input]) => [key, input.value])) as EstimateInput;
  const updateResultState = () => {
    const parsed = parseEstimate(readInputs());
    const matches = parsed.input && estimateFields.every(({ key }) => compare(decimal(parsed.input![key])!, decimal(calculated[key])!) === 0);
    const message = matches
      ? 'Result for the values currently shown in Inputs.'
      : parsed.input
        ? 'Inputs changed. The result and drawing retain the last calculation; press Calculate to update them.'
        : 'Inputs are incomplete or invalid. The result and drawing retain the last valid calculation; correct the inputs and press Calculate.';
    if (resultState.textContent !== message) resultState.textContent = message;
  };
  form.addEventListener('input', updateResultState);

  const show = (input: EstimateInput) => {
    const r = estimate(input);
    calculated = { ...input };
    updateResultState();
    const s = sketch(Number(input.length), Number(input.width), Number(input.depth));
    out('volume').textContent = showQuantity(r.volume, 'm³').text;
    out('adjusted').textContent = showQuantity(r.adjustedVolume, 'm³').text;
    out('batches').textContent = String(r.batches);
    out('time').textContent = showDuration(r.minutes).text;
    const list = root.querySelector<HTMLElement>('[data-estimate-steps]');
    list?.replaceChildren(
      ...breakdown(input, r).map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      }),
    );
    const svg = root.querySelector<SVGElement>('[data-estimate-sketch]');
    if (svg) {
      for (const face of ['front', 'top', 'side'] as const) svg.querySelector(`[data-face="${face}"]`)?.setAttribute('points', s[face]);
      for (const key of ['length', 'width', 'depth'] as const) {
        const label = svg.querySelector(`[data-label="${key}"]`);
        if (!label) continue;
        label.setAttribute('x', String(s.labels[key][0]));
        label.setAttribute('y', String(s.labels[key][1]));
        label.textContent = `${key[0]!.toUpperCase()} = ${input[key]} m`;
      }
      const title = svg.querySelector('[data-estimate-sketch-label]');
      if (title) title.textContent = `Rectangular element, ${input.length} m long, ${input.width} m wide and ${input.depth} m deep`;
    }
    const scale = root.querySelector<HTMLElement>('[data-estimate-scale]');
    if (scale) scale.textContent = s.depthToScale ? 'Drawn to scale.' : 'Schematic; depth not drawn to scale.';
    return r;
  };

  const clearErrors = () => {
    errorBox.hidden = true;
    errorList.replaceChildren();
    for (const [key, input] of inputs) {
      input.removeAttribute('aria-invalid');
      input.setAttribute('aria-describedby', input.getAttribute('aria-describedby')!.replace(` estimate-${key}-error`, ''));
      errors.get(key)!.hidden = true;
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearErrors();
    const raw = readInputs();
    const { input, errors: found } = parseEstimate(raw);
    if (!input) {
      updateResultState();
      for (const field of estimateFields) {
        const message = found[field.key];
        if (!message) continue;
        const el = inputs.get(field.key)!;
        el.setAttribute('aria-invalid', 'true');
        el.setAttribute('aria-describedby', `${el.getAttribute('aria-describedby')} estimate-${field.key}-error`);
        errors.get(field.key)!.textContent = message;
        errors.get(field.key)!.hidden = false;
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `#estimate-${field.key}`;
        link.textContent = `${field.label}: ${message}`;
        link.addEventListener('click', (e) => {
          e.preventDefault();
          el.focus();
        });
        item.append(link);
        errorList.append(item);
      }
      errorBox.hidden = false;
      errorBox.focus();
      announce('The estimate was not calculated: check the highlighted values. The last valid result is retained.');
      return;
    }
    const r = show(input);
    announce(
      `Estimate: ${showQuantity(r.adjustedVolume, 'm³').text.replace('≈', 'about')} including waste, ${r.batches} mixer batches, ${showDuration(r.minutes).text.replace('≈', 'about')} of idealized production time.`,
    );
  });

  const useExample = () => {
    clearErrors();
    for (const [key, input] of inputs) input.value = defaultEstimateInput[key];
    show(defaultEstimateInput);
  };
  root.querySelector('[data-estimate-example]')?.addEventListener('click', () => {
    useExample();
    announce('Example values restored: 13 mixer batches, 1 h 18 min of idealized production time.');
  });
  return useExample;
}
