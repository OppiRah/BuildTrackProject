# BuildTrack Delivery Roadmap

Updated: 2026-10-04. This revision uses phases 0–10, superseding the original 0–8 numbering. References to older phase numbers must be matched by objective. This is a delivery plan, not blanket authorization to execute every phase.

| Phase | Objective and output | Completion gate |
|---|---|---|
| 0 — Discovery | Business scope, coverage, segments, pricing direction, conversion flow | Complete: major business/architecture ambiguities settled; release details deferred explicitly |
| 1 — Architecture specification | Specify Astro/static approach, data/config boundaries, form-provider selection criteria and deployment options | Coherent implementable specification; unresolved external setup recorded. Drafted 2026-10-04 in `ARCHITECTURE.md`, pending review |
| 2 — UX/design | Desktop/mobile wireframes, logo direction, tokens/type, page content/CTA hierarchy | Design direction reviewed; accessibility/contrast considered. Specification drafted 2026-10-04 in `UX_BRAND.md`, pending review |
| 3 — Foundation | Scaffold Astro (static)/strict TypeScript, tokens and global CSS, base layout, header/mobile nav/footer, route stubs + 404, `null`-valued config modules, Vitest, scripts and lockfile (`ARCHITECTURE.md` §8) | Reproducible dev/build/type checks; responsive shell. Implemented 2026-10-04; rendered layouts pending human review |
| 4 — Core website | Seven page content/navigation/footer, services, proposed pricing, coverage, graphics/metadata | Business requirements visible; responsive core pages usable. Implemented 2026-10-04 with pending markers for unapproved values; copy and rendering pending human review |
| 5 — Product demo | Fictional typed fixtures, project/section/filter interactions and coherent cards/tables/charts | All sample data labeled; interactions work; no live/backend claims. Implemented 2026-10-04; pending human review |
| 6 — Conversion | Configure provider/recipient; build preselection/form/validation/success/error handling | Local integration test accepted by provider and receipt confirmed by contact; hosted preview test only if needed and explicitly authorized; production test repeated in Phase 9 (`ARCHITECTURE.md` §6.6). Form implemented and tested with mocked responses 2026-10-04; endpoint configured; local delivery verified 2026-10-04 (gate met); production delivery pending Phase 9 |
| 7 — QA | Responsive/mobile/browser, keyboard/accessibility, forms, content, security, performance and metadata | Critical defects fixed; checks and limitations documented. Completed 2026-10-04 (evidence and gaps in `PROJECT_STATE.md`) |
| 8 — Independent review | Independent reviewer examines actual code against requirements; triage/fix findings | Material findings resolved or explicitly accepted with rationale. Complete 2026-10-04: three review findings (configuration vs verification copy, pricing table header semantics, error-summary semantics) resolved 2026-10-04; see `PROJECT_STATE.md` |
| 9 — Production | Public hosting/HTTPS, domain if chosen, production metadata and smoke tests | Public URL verified; professor-style form submission actually received; no business placeholders. Hosting configuration prepared and checked locally 2026-10-04; not deployed |
| 10 — Knowledge transfer | Walkthrough, implemented-system presentation guide and likely professor questions | Friend explains business, request flow, simulated demo and basic hosting |

## Workflow
Roles: planning/specification/research and triage; primary implementation; human decisions and manual/device testing; independent repository review and targeted fixes when requested. One contributor owns a given edit at a time. Do not run competing implementation sessions in the same checkout.

Use meaningful independent review checkpoints after foundation/core pages, after demo/conversion and before production. Phase 8 consolidates final review; checkpoint reviews need not wait until the end. Review does not automatically authorize code changes.

## Scope discipline
Complete a phase's coherent output and record evidence before claiming it finished. If a requested task already authorizes the next action, continue within that scope; no ceremonial approval prompts. New architecture scope, purchases and publishing are separate actions unless explicitly authorized. Provider configuration can be investigated early so delivery does not become a late blocker. Exact PHP amounts, contact details and verified recipient are release requirements, not reasons to invent content or block architecture/design work.

## Final transfer
Create `PRESENTATION_GUIDE.md` only after implementation exists. Cover business/customer/revenue story, page walkthrough, request demonstration, where request data goes, fictional dashboard data, QR/RFID/IoT concepts and domain/hosting basics. Prepare honest answers about what actually works. No code/framework memorization requirement.
