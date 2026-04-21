# Debt Collection Self-Education

- [ ] Literature
  - [ ] Start here
  - [ ] Broader context
  - [ ] Ongoing (not books)
- [ ] Debt Collection Basics
- [ ] Regulatory Universe
- [ ] Collect! CRM
- [ ] Big Data & LLM Pipelines
  - [ ] Analytics & modeling
  - [ ] Compliance-critical external APIs
  - [ ] Skip-trace & investigative data
  - [ ] Credit, consumer & regulatory feeds
  - [ ] LLM pipelines
  - [ ] Tooling & infra
- [ ] The Operation
- [ ] Competitive Landscape
- [ ] 30/60/90 Integration Plan
  - [ ] Days 1-30: bearings
  - [ ] Days 31-60: ship one thing
  - [ ] Days 61-90: expand & propose the bet

## Literature

### Start here

- [ ] *Bad Paper: Chasing Debt from Wall Street to the Underworld* — Jake Halpern (2014). Journalistic deep-dive on the Buffalo debt-buying ecosystem; best accessible on-the-ground account.
- [ ] CFPB Supervision and Examination Manual, debt collection module — free PDF at consumerfinance.gov. What regulators actually use during exams.
- [ ] NCLC *Fair Debt Collection* treatise — National Consumer Law Center. Walks every FDCPA section with case law; ~$180+, current edition. The practitioner bible.

### Broader context

- [ ] *Debt: The First 5,000 Years* — David Graeber. Anthropology of debt and moral-obligation narratives.
- [ ] *As We Forgive Our Debtors* — Sullivan, Warren, Westbrook. Academic foundation on consumer bankruptcy economics; relevant to PACER / Ch. 7 / Ch. 13 workflows.
- [ ] *Broke, USA: From Pawnshops to Poverty, Inc.* — Gary Rivlin. The adjacent predatory-finance ecosystem (payday, subprime, check-cashing).

### Ongoing (not books)

- [ ] ProPublica debt-collection reporting — Paul Kiel's investigative series
- [ ] insideARM — trade press, operator-level news
- [ ] AccountsRecovery.net — trade press, vendor and enforcement chatter
- [ ] CFPB annual debt collection report to Congress — yearly data snapshot
- [ ] RMA International (Receivables Management Association) conference talks and whitepapers
- [ ] NCLC *Collection Actions* and *Fair Credit Reporting* treatises — companion volumes to *Fair Debt Collection*

## Debt Collection Basics

- [ ] Industry structure: original creditor → debt buyer → agency → legal
- [ ] Placement vs purchase (contingency fee vs portfolio acquisition)
- [ ] Debt types: credit card, medical, auto deficiency, student, BNPL, utility
- [ ] Chain of title & media (bill of sale, account-level affidavits, original creditor docs)
- [ ] Statute of limitations (state-level variance, revival risk)
- [ ] Compliance Management Systems (CMS) as an operational concept
- [ ] Tranche economics: liquidation curves, cost-to-collect, net-back

## Regulatory Universe

- [ ] FDCPA (15 USC 1692) — scope, prohibited practices, validation rights
- [ ] Regulation F (12 CFR 1006) — 7-in-7 call cap, LCA (Limited-Content Message), time/place restrictions
- [ ] Model Validation Notice (MVN) — required content, itemization date, dispute prompts
- [ ] FCRA — furnisher duties, e-OSCAR disputes, Metro 2 reporting format
- [ ] TCPA — autodialer/ATDS, prior express consent, texting rules
- [ ] E-SIGN Act & electronic-comms consent capture
- [ ] GLBA Safeguards Rule — data handling obligations
- [ ] UDAAP — CFPB enforcement lens (unfair, deceptive, abusive)
- [ ] State licensing, surety bonds, and state-specific rule overlays (NY, CA, MA, CO notably strict)
- [ ] CFPB supervision & exam manual (debt collection module)

## Collect! CRM

- [ ] Data model — Debtor, Client, Transaction, Contact tables; MS SQL backing store
- [ ] Scripting & automation — built-in scripting language, batch processing, triggers
- [ ] Letter templates + MVN compliance (template options, merge fields, audit trail)
- [ ] Operator work queues — prioritization, skill routing, activity logging
- [ ] Emailing & texting — consent gating, TCPA/E-SIGN alignment
- [ ] Import/export & API — integration surface for external pipelines
- [ ] Reporting — stock reports, Report Utility, reporting dashboard
- [ ] Portals — consumer, client, account access
- [ ] Credit bureau reporting pipeline (Metro 2 output)
- [ ] Security posture — encryption, MFA, secure data transfer
- [ ] Compliance features — dispute flags, do-not-contact, cease-comm, bankruptcy/deceased handling
- [ ] Modules & add-ons ecosystem
- [ ] Deployment model — premise vs cloud trade-offs

## Big Data & LLM Pipelines

### Analytics & modeling

- [ ] Tranche-level statistical profiling (recovery curves, segmentation, SOL-by-state flags)
- [ ] Cost-to-collect modeling and net-back forecasting per portfolio
- [ ] Propensity-to-pay and right-party-contact scoring

### Compliance-critical external APIs

- [ ] PACER — federal court records; bankruptcy filings trigger automatic stay (collecting after = FDCPA violation)
- [ ] DOD SCRA database — mandatory active-military check before suit or default judgment (statutory damages if missed)
- [ ] SSA Death Master File (DMF) — deceased-debtor handling, estate vs. individual collection rules
- [ ] FCC Reassigned Numbers Database (RND) — TCPA safe harbor for pre-dial checks
- [ ] USPS NCOA (National Change of Address) — required-by-practice for mailed notice deliverability
- [ ] OFAC SDN / sanctions screening

### Skip-trace & investigative data

- [ ] LexisNexis Risk Solutions — Accurint for Collections (industry default)
- [ ] TransUnion TLOxp — major Accurint competitor
- [ ] Thomson Reuters CLEAR — investigative data platform
- [ ] IDI (idiCORE) — formerly Interactive Data
- [ ] Experian Skip Tracing / Clarity Services (subprime data)
- [ ] Consumer-grade aggregators (BeenVerified, Spokeo, Whitepages Pro) — use with care
- [ ] State court / civil judgment aggregators — UniCourt, Trellis, Courthouse News
- [ ] County recorder & assessor APIs — real-property ownership
- [ ] Employment & income — The Work Number (Equifax), Plaid-based verification
- [ ] Phone reputation / line-type — Neustar TRUContact, Twilio Lookup

### Credit, consumer & regulatory feeds

- [ ] Big 3 bureaus — Experian, Equifax, TransUnion (collections-specific products)
- [ ] FactorTrust — subprime alternative credit data
- [ ] CFPB Consumer Complaint Database (public API) — monitor your company + peers
- [ ] CFPB enforcement actions & consent orders corpus (RAG-ingestion target)
- [ ] State AG enforcement feeds

### LLM pipelines

- [ ] RAG over regulatory corpus (FDCPA, Reg F, state overlays, CFPB consent orders)
- [ ] RAG over account-level media (affidavits, statements, chain-of-title docs)
- [ ] Skip-trace orchestration — normalize results across vendor APIs into a unified debtor profile
- [ ] LLM-assisted dispute validation workflows
- [ ] Letter generation with compliance guardrails (MVN-aware, auditable)
- [ ] Agent memory with Letta (persistent debtor/account context)

### Tooling & infra

- [ ] Open-source RAG stacks — LlamaIndex, Haystack, txtai
- [ ] Vector stores — pgvector, Qdrant, Weaviate
- [ ] Document parsing — Unstructured.io, Docling (affidavits, statements, OCR'd media)
- [ ] Observability & audit trails — CFPB-exam-ready logging of model decisions
- [ ] PII handling, redaction, and on-prem / air-gapped inference options

## The Operation

Living doc — fill in as I learn the partner's specific business.

- [ ] Business entity structure — LLC/Corp, ownership, my role on paper
- [ ] Segment(s) served — 1st-party, 3rd-party agency, debt buyer; vertical (medical, card, auto, student, utility, BNPL)
- [ ] Licensed states and rule overlays relevant to this footprint
- [ ] Client mix — placement contracts, purchase contracts, key accounts
- [ ] Staff shape — collectors, supervisors, QA, compliance, tech, outside counsel
- [ ] Tech stack — CRM (Collect!?), dialer, skip-trace vendors, doc management, payment processing, bureau furnisher tooling
- [ ] Data footprint — volumes, retention, per-client segregation, access model
- [ ] Current highest-cost or highest-risk workflows (partner's view)
- [ ] Regulatory posture — CFPB complaints, state-AG history, pending matters
- [ ] Existing automation / BI / reporting baseline
- [ ] Where partner already thinks AI/data can move the needle

## Competitive Landscape

Survey breadth, not depth. Know who's out there for build-vs-buy and whitespace judgment.

- [ ] Consumer-facing / creditor-side: TrueAccord, Collectly, Cedar (medical), January AI, Spinwheel, Peach Finance
- [ ] Agency-side AI / voice: Prodigal, Skit.ai, Convoso, Symend
- [ ] Incumbents: LiveVox, Latitude by Genesys, Finvi (ex-Ontario Systems), Provana
- [ ] EU/global: Receeve, re:cap
- [ ] Dispute / FCRA tooling: Array, CreditXpert
- [ ] Large debt buyers (peers and potential clients): Encore, PRA, Jefferson Capital, Midland Credit, NCB
- [ ] Recent funding rounds and M&A in collections tech — who's buying, who's getting bought
- [ ] Open-source and infra plays adjacent to us — Letta, LlamaIndex, Haystack positioning

## 30/60/90 Integration Plan

Remote-first — no physical office. All onboarding via Collect! access, recorded calls, document review, and video screen-shares.

### Days 1-30: bearings

- [ ] Collect! access (read-only first, then sandbox); walk the data model end-to-end
- [ ] Review representative recorded calls — QA-approved and QA-flagged
- [ ] Read the letter template library; trace MVN flow from generation to mail/e-delivery
- [ ] Read dispute queue + sample e-OSCAR responses
- [ ] Screen-share with a collector working a live queue (1-2 sessions)
- [ ] Screen-share with staff attorney on a compliance review
- [ ] Sit in (video) on next ops meeting and compliance meeting
- [ ] Read partner's placement/purchase contracts at a high level
- [ ] Document 3-5 quick-win candidates with partner sign-off

### Days 31-60: ship one thing

- [ ] Pick highest-leverage / lowest-blast-radius quick win
- [ ] Quick-win candidate list:
  - [ ] MVN-aware letter generation with attorney sign-off gate
  - [ ] LLM-assisted call QA (sample supervisor review at 10x throughput)
  - [ ] Dispute triage / e-OSCAR prep automation
  - [ ] Skip-trace result normalization across existing vendors
  - [ ] SMS/email drafting with compliance review loop
- [ ] Ship behind a human-approval gate; staff attorney in the loop
- [ ] Measure baseline vs. outcome; report to partner

### Days 61-90: expand & propose the bet

- [ ] Expand the first win (adjacent workflows, more clients, more volume)
- [ ] Propose one strategic bet:
  - [ ] Proprietary model trained on the partner's collections data
  - [ ] RAG-over-regulatory-corpus advisor for the staff attorney
  - [ ] Payment-propensity scoring tied to contact strategy
  - [ ] Chain-of-title / media retrieval automation
  - [ ] Voice-agent right-party-contact (TCPA-hard; high-risk/high-reward)
- [ ] Draft year-one roadmap aligned with partner's business goals
