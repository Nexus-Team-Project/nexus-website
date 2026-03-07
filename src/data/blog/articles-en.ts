import type { Article } from './types';

export const articlesEn: Article[] = [
  // ─── Article 1: Employee Gifts ───
  {
    slug: 'employee-gifts',
    title: 'Employee Gift Guide – How Organizations Distribute Benefits Smartly',
    subtitle: 'Budget, timing, digital vouchers, and what actually works',
    excerpt:
      'How to build an employee gift program that lasts all year: budget models, operational checklists, real-world examples, and insights on gift cards and vouchers in Israel.',
    metaTitle: 'Employee Gift Guide: Budget, Timing, Digital Vouchers & What Works',
    metaDescription:
      'How to build an employee gift program that lasts all year: budget models, operational checklists, real-world examples, and insights on gift cards and vouchers. Includes email templates & FAQ.',
    category: 'gifts',
    heroImage: '/blog/employee-gifts-hero.jpg',
    author: { name: 'Nexus Team', role: 'Loyalty & Payments Infrastructure' },
    publishDate: '2026-04-01',
    readTime: 10,
    sections: [
      {
        type: 'heading',
        level: 2,
        text: 'Why gifts are a "system", not an "event"',
        id: 'why-system',
      },
      {
        type: 'paragraph',
        text: 'If employee gifts only happen around two holidays a year, they quickly become an operational routine with no real impact. But when you build them as an annual program, they become a tool that strengthens belonging, employee experience, and consistent recognition.',
      },
      {
        type: 'paragraph',
        text: 'Put simply: a great gift isn\'t necessarily "more money" — it\'s better fit (choice, timing, relevance) and more transparency (what you get, when, how to redeem, expiry). When done right, employees feel someone thought about them, and the organization gets a measurable, improvable system.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'What counts as an "employee gift" in 2026',
        id: 'what-counts',
      },
      {
        type: 'paragraph',
        text: 'In practice, "employee gifts" include a wide basket: digital gift cards and vouchers, experience vouchers, selection websites/catalogs, food credits/benefit budgets, physical gift boxes, or a combination of all. Consumer behavior shows a shift from narrow "lunch" boundaries to flexible benefit budgets used across supermarkets, convenience stores, and additional categories.',
      },
      {
        type: 'paragraph',
        text: 'To choose correctly, don\'t start with the vendor. Start with three decisions:',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'What\'s the goal (recognition? retention? culture building? "peace and quiet" around holidays?)',
          'What level of personalization (uniform for all, tiered by tenure/role, or free choice)',
          'What control mechanism (budget, expiry, redemption reports, exception handling)',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'How to build an annual gift and benefits calendar',
        id: 'annual-plan',
      },
      {
        type: 'paragraph',
        text: 'A good program sits on an organizational + national calendar. It\'s important to sync wellness with holidays, personal milestones, and professional peaks — and build the mix around real goals and needs.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Sample recommended calendar (principles)',
        id: 'calendar-example',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Major holidays = large/central gift',
          'Birthdays/work anniversaries = automation + quick choice',
          'Organizational "peaks" (end of quarter, product launch, SLA achievement) = micro-recognition',
          'Situational support (family emergency, military reserve duty, return from long leave) = support grant per policy',
        ],
      },
      {
        type: 'heading',
        level: 3,
        text: 'Annual planning checklist',
        id: 'annual-checklist',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Define 3–5 measurable goals (retention, satisfaction, benefit adoption, employee NPS).',
          'Build segments: departments, geographic distribution, hybrid/remote, dedicated populations.',
          'Decide on "recognition frequency": two big events + X micro-events.',
          'Set fairness policy: who\'s eligible (including temp/contractor/parental leave per policy).',
          'Choose distribution mechanism (see below).',
          'Define operational KPI: % distribution success, exception handling time, % redemption.',
          'Write communication plan: advance notice + reminders + "how to redeem".',
          'Schedule quarterly retrospective: what worked, what didn\'t, what to change.',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Gift budget: how to avoid overshoot',
        id: 'budget',
      },
      {
        type: 'paragraph',
        text: 'In practice, organizations fall into two extremes: "give as much as possible" without a system, or "give the minimum" and suffer reputationally. The secret is turning the budget into a decision engine.',
      },
      {
        type: 'paragraph',
        text: 'A common budget split model is 50-40-10 (employees, customers, partners), with the recommendation to allocate most of the budget to employees.',
      },
      {
        type: 'callout',
        text: 'Practical principle: Plan early. For holiday gifts, start 2–3 months ahead (June–August), to compare vendors, avoid logistics pressure, and ensure on-time delivery.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Budget template – recommended columns',
        id: 'budget-template',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Event (New Year / Passover / birthday / micro-recognition)',
          'Population (all / department / tenure / site)',
          'Number of eligible employees',
          'Gross gift value',
          'Actual employer cost (including discounts/fees)',
          'Operational cost (shipping, packaging, team time)',
          'Tax/gross-up cost (if applicable)',
          'Total cost',
          'Redemption target (%)',
          'Send date / redemption deadline',
          'Outcome KPI (quick survey, NPS, participation, feedback)',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Choosing a distribution mechanism: options and fit',
        id: 'distribution',
      },
      {
        type: 'paragraph',
        text: 'To create a good experience, the mechanism matters just as much as the value. In Israel, there are also regulatory aspects regarding voucher validity and transparency.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Option 1: Digital voucher (Gift Code / Wallet)',
        id: 'option-digital',
      },
      {
        type: 'paragraph',
        text: 'Suited for organizations looking for speed, remote distribution, redemption tracking, and reminders. Advantage: easy to segment and measure.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Option 2: Employee selection site (Marketplace)',
        id: 'option-marketplace',
      },
      {
        type: 'paragraph',
        text: 'Suited when there\'s high diversity in needs (families with children, singles, periphery/center). Enables "personalization without managing 300 orders".',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Option 3: Physical gift/box',
        id: 'option-physical',
      },
      {
        type: 'paragraph',
        text: 'Suited when a visual "ceremony" matters. Downside: logistics, shipping costs, difficulty with personalization.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Option 4: Ongoing benefit budget (monthly/quarterly)',
        id: 'option-ongoing',
      },
      {
        type: 'paragraph',
        text: 'Gaining traction: ~80% of companies allow flexible monthly budgets, and organizations have expanded usage to additional categories beyond food.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Regulation, validity, and transparency: what you must know',
        id: 'regulation',
      },
      {
        type: 'paragraph',
        text: 'It\'s important to distinguish between two levels: (a) Consumer Protection Law (definitions and validity of gift cards/vouchers); (b) Payment services regulations that impose disclosure/handling obligations for loss/theft in certain cases.',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Gift card – minimum validity: Under consumer protection law, if an issuer limits validity, it cannot be less than five years and must be clearly stated.',
          'Credit voucher and gift voucher – minimum validity: A credit voucher must be valid for at least two years, and these provisions also apply to "gift vouchers".',
          'Disclosure and recovery obligations: Regulations (2022) established disclosure obligations regarding material terms (issuer identity, redemption method, vendor list, validity, loss/theft instructions) and an obligation to recover balance in case of loss/theft.',
          'Minimum validity terms: Validity cannot be limited to less than 5 years for gift cards and 2 years for gift vouchers, with easy renewal available upon holder request.',
          'Tightening trend 2025–2026: Regulatory changes in gift cards/vouchers — including validity extensions and consumer notifications.',
        ],
      },
      {
        type: 'callout',
        text: 'General information — not tax/legal advice. Consult a professional for any specific question.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Tax and payroll implications: what not to ignore',
        id: 'tax',
      },
      {
        type: 'paragraph',
        text: 'As a rule, income tax must be paid on the full value of a holiday gift; if the employer purchased vouchers below face value, taxation may be based on actual employer cost; many employers gross up the tax but are not obligated to.',
      },
      {
        type: 'paragraph',
        text: 'The practical implication: already at the budgeting stage, it\'s worth aligning HR, Payroll, and Finance on whether to gross up and how to report.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Real-world examples: company, NGO, and municipality',
        id: 'examples',
      },
      {
        type: 'paragraph',
        text: 'These examples are "templates" for implementation; numbers are illustrative only.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Company scenario (700 employees, hybrid)',
        id: 'example-company',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'New Year: selection site/digital voucher at uniform value + personal greetings from managers.',
          'Quarterly micro-recognition: 150–200 ILS per employee for team goal achievement, redeemable also at supermarkets.',
          'Measurement: % redemption within 30/60 days; reduction in "how to redeem" support tickets; quick survey.',
        ],
      },
      {
        type: 'heading',
        level: 3,
        text: 'NGO scenario (grants/support for beneficiaries)',
        id: 'example-ngo',
      },
      {
        type: 'paragraph',
        text: 'Payment services regulations address economic support cards transferred through government bodies or non-profit organizations. This enables thinking about a "support wallet" that defines authorized categories/vendors and provides transparency: balance, validity, and redemption method.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Municipality scenario (residents/employees/volunteers)',
        id: 'example-municipality',
      },
      {
        type: 'paragraph',
        text: 'An example of a "resident benefits club" approach includes municipal programs offering digital benefits to residents. The framing is service-oriented: eligibility by resident/employee status, benefit catalog, and controlled redemption.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Useful templates',
        id: 'templates',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Employee email template – holiday gift',
        id: 'template-employee',
      },
      {
        type: 'callout',
        text: 'Subject: 🎁 Your holiday gift is on the way – choose and redeem in 2 minutes\nHi {{name}},\nFor the holiday, you\'ve been allocated a gift worth {{amount}} ILS.\nHow to redeem:\n1) Click the link: {{link}}\n2) Choose where to redeem / what to order\n3) Save the confirmation – done.\nRedemption deadline: {{date}}.\nQuestions: {{email/chat}}.\nHappy holidays, {{organization name}}',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Vendor RFQ template',
        id: 'template-vendor',
      },
      {
        type: 'callout',
        text: 'Subject: RFQ – Employee gift program ({{number}} employees)\nPlease provide a proposal including:\n• Solution types (digital/physical/selection site)\n• Validity, redemption terms, loss/replacement handling\n• Redemption reports and segmentation capabilities\n• Support SLA for end users\n• Fees/discounts at scale',
      },
    ],
    faq: [
      {
        question: 'When should you start planning holiday gifts?',
        answer:
          'It\'s recommended to plan 2–3 months ahead to allow for budgeting, vendor comparison, and timely distribution.',
      },
      {
        question: 'What\'s the difference between a gift card and a gift voucher in terms of validity?',
        answer:
          'Under consumer protection law, a gift card (if limited) must be valid for at least 5 years; a credit voucher for at least 2 years, and these provisions also apply to gift vouchers.',
      },
      {
        question: 'Must you give the same gift to all employees?',
        answer:
          'No. You can go uniform, tiered, or free choice — the decision depends on organizational culture and fairness/operational considerations.',
      },
      {
        question: 'Is an employee gift subject to tax?',
        answer:
          'Generally, income tax is due on the full value of a holiday gift, and in some cases may be based on actual employer cost if purchased at a discount; consult payroll/tax advisor.',
      },
      {
        question: 'What\'s the advantage of digital over physical gifts?',
        answer:
          'Typically: faster distribution, less logistics, easier to track redemption and handle exceptions.',
      },
      {
        question: 'How do you measure the success of a gift program?',
        answer:
          'A combination of operational KPIs (distribution/redemption success rate) + employee experience metrics (quick survey/NPS) + retention metrics over time.',
      },
    ],
  },

  // ─── Article 2: Benefits Club ───
  {
    slug: 'benefits-club',
    title: 'How to Build a Benefits Club for Your Organization – The Complete Guide',
    subtitle: 'Vendors, eligibility, budget, and measurement',
    excerpt:
      'A practical guide to setting up a benefits club for employees/members: economic model, vendor partnerships, redemption UX, success metrics, and technology infrastructure.',
    metaTitle: 'How to Build a Benefits Club – Vendors, Eligibility, Budget & Measurement',
    metaDescription:
      'A practical guide to setting up a benefits club for employees/members: economic model, vendor partnerships, redemption UX, success metrics, and technology infrastructure.',
    category: 'benefits',
    heroImage: '/blog/benefits-club-hero.jpg',
    author: { name: 'Nexus Team', role: 'Loyalty & Payments Infrastructure' },
    publishDate: '2026-04-08',
    readTime: 9,
    sections: [
      {
        type: 'heading',
        level: 2,
        text: 'What is an "organizational benefits club" and what it\'s not',
        id: 'what-is',
      },
      {
        type: 'paragraph',
        text: 'An organizational benefits club is a platform (digital or hybrid) where the organization "curates" a benefit package and subsidizes/manages access: discounts, vouchers, experiences, services, and products. It doesn\'t have to be a "community" and doesn\'t require "social club" language — you can position it as a service infrastructure that gives employees freedom of choice + preferred terms + a transparent redemption process.',
      },
      {
        type: 'paragraph',
        text: 'Examples at scale include programs that centralize diverse benefits for members across multiple categories (housing, automotive, travel, food, etc.), as well as municipal programs offering digital benefits and resident cards with discount packages.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Why build a benefits club now',
        id: 'why-now',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Retention and recruitment: Benefits are part of the employee experience and affect the perception of "how much the organization sees me." The link between recognition and retention is well-documented.',
          'Flexibility as standard: Data shows a shift toward flexible budgets and expanded categories — making it harder to manage benefits "manually."',
          'Spending control: Instead of "checks in every direction," a club lets you define a framework, authorized vendors, expiry dates, and reports.',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Economic model: who funds what',
        id: 'economic-model',
      },
      {
        type: 'paragraph',
        text: 'Before talking technology, you need to decide on a model:',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Model A – Full organizational subsidy',
        id: 'model-a',
      },
      {
        type: 'paragraph',
        text: 'The employee doesn\'t pay. The organization buys vouchers/benefits and distributes them. Suited when the primary goal is recognition/welfare.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Model B – Partial subsidy (+ employee top-up)',
        id: 'model-b',
      },
      {
        type: 'paragraph',
        text: 'The organization funds a base, and the employee can add from their own pocket to upgrade. Suited for expanding categories without increasing budget.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Model C – "Discount only" (no budget)',
        id: 'model-c',
      },
      {
        type: 'paragraph',
        text: 'The organization manages a club that offers club pricing through agreements, without transferring money. Suited as a complementary perk.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Model D – Combination (holiday + monthly budget)',
        id: 'model-d',
      },
      {
        type: 'paragraph',
        text: 'Holidays = large budget; ongoing = small, flexible budget. Companies in practice are expanding budgets and enabling monthly flexibility.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Practical setup: 10-step workflow',
        id: 'setup-steps',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Define scope: who the club is for (employees, volunteers, residents), and what\'s "not in scope."',
          'Gather needs: quick survey/focus groups — not "what I think is cool."',
          'Catalog architecture: categories by decision type (food, grocery, leisure, wellness, education).',
          'Eligibility rules: who gets what, when (onboarding, tenure, position, location).',
          'Vendor sourcing: "Core" vendors with high demand, regional vendors (periphery/center), "experience" vendor for peaks.',
          'Contracts and policies: SLA, cancellations, customer service, refund policy.',
          'Redemption UX: benefit page → terms → redeem → confirmation → support.',
          'Reminders and messaging: notifications about balance, expiry, and campaigns.',
          'Reporting and measurement: usage by category/vendor/region.',
          'Continuous improvement: first quarter = see churn; second quarter = optimize the mix.',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Regulation and policy: how to avoid the "fine print" pitfalls',
        id: 'regulation',
      },
      {
        type: 'paragraph',
        text: 'If the benefits club includes vouchers/gift cards, pay attention to minimum validity periods and prominence of expiry dates, as established in consumer protection law regarding gift cards and credit/gift vouchers.',
      },
      {
        type: 'paragraph',
        text: 'Additionally, if you operate an ongoing "benefits program," consumer protection law includes provisions defining benefits programs and framework for changes/termination — reinforcing the need for transparent change policies and organized communication.',
      },
      {
        type: 'callout',
        text: 'General information — not tax/legal advice. Consult a professional for any specific question.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Useful templates',
        id: 'templates',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Employee launch announcement template',
        id: 'launch-template',
      },
      {
        type: 'callout',
        text: 'Subject: Our benefits club is live 🎉\nHi everyone,\nStarting today you have access to an organizational benefits club with {{number}} benefits across {{categories}}.\nHow to get started:\n1) Log in via SSO: {{link}}\n2) Choose a benefit\n3) Redeem per the instructions on the page\nQuestions/support: {{chat link}}\nWe\'ll update monthly with new benefits + "most recommended" based on usage.',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Vendor outreach template (mandatory points)',
        id: 'vendor-template',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Exact benefit description (discount/voucher/bundle)',
          'Eligibility terms, validity, exclusions',
          'Service SLA (call center/email)',
          'Cancellation/refund process',
          'Monthly reporting mechanism (redemption count/total revenue)',
          'Economic model (commission/discount/subsidy)',
        ],
      },
    ],
    faq: [
      {
        question: 'How many benefits do you need to launch a club?',
        answer:
          'Prefer 20–40 quality, diverse benefits for launch, then expand based on usage and data.',
      },
      {
        question: 'Does a benefits club have to include budget (money)?',
        answer:
          'No. You can run a discount-only club, or combine with budget for specific events.',
      },
      {
        question: 'What\'s the difference between a "benefit" and a "gift voucher" in terms of validity?',
        answer:
          'Gift/credit vouchers are subject to minimum validity, and gift cards are linked to a minimum of 5 years if limited — per consumer protection law and payment services regulations.',
      },
      {
        question: 'How do you know which categories to add?',
        answer:
          'Look at actual usage. Data shows expansion of budgets to additional categories beyond food and monthly flexibility.',
      },
      {
        question: 'How do you ensure the club works in the periphery too?',
        answer:
          'Require regional coverage from Core vendors, and enable online categories (grocery, pharmacy, digital vouchers).',
      },
    ],
  },

  // ─── Article 3: Loyalty & Payments Infrastructure ───
  {
    slug: 'loyalty-payments',
    title: 'What Is Loyalty & Payments Infrastructure for Organizations',
    subtitle: 'Components, security, regulation, and RFP',
    excerpt:
      'A full breakdown of the stack behind benefits, points, and budgets in organizations: digital wallet, redemption engine, settlement, PCI DSS, and regulatory considerations in Israel.',
    metaTitle:
      'Loyalty & Payments Infrastructure for Organizations – Components, Security, Regulation & RFP',
    metaDescription:
      'A full breakdown of the stack behind benefits, points, and budgets in organizations: digital wallet, redemption engine, settlement, PCI DSS, and regulatory considerations in Israel.',
    category: 'loyalty',
    heroImage: '/blog/loyalty-payments-hero.jpg',
    author: { name: 'Nexus Team', role: 'Loyalty & Payments Infrastructure' },
    publishDate: '2026-04-15',
    readTime: 12,
    sections: [
      {
        type: 'heading',
        level: 2,
        text: 'The problem this infrastructure solves',
        id: 'problem',
      },
      {
        type: 'paragraph',
        text: 'Organizations distribute value to employees/members: holiday gifts, food budgets, coupons, discounts, points, grants. Without infrastructure, this fragments across vendors, Excel files, service centers, and Finance struggling with reconciliation. The result: inconsistent employee experience, "budget leaks," and headaches around validity/balance/exception notifications.',
      },
      {
        type: 'paragraph',
        text: 'Loyalty and payments infrastructure brings order: define eligibility, allocate value, run a redemption engine, measure, and settle — with a security and compliance layer suited for modern payment.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Core infrastructure components',
        id: 'core-components',
      },
      {
        type: 'paragraph',
        text: 'Think of the stack as 8 layers:',
      },
      {
        type: 'list',
        ordered: true,
        items: [
          'Identity & Eligibility — who\'s eligible, based on what (role, tenure, resident/non-resident, employment status). Connected to HRIS/Active Directory/SSO.',
          'Wallet / Ledger — stores balance and history (allocation, redemption, cancellation, recovery). Requires event logging for audit.',
          'Catalog & Offers — benefit representation: vouchers, discounts, bundles, one-time benefits, recurring benefits.',
          'Redemption Engine — the process from when the user clicks "redeem" to confirmation. Includes codes, QR, real-time eligibility verification, duplicate prevention, and validity logic.',
          'Payments & Settlement — how money actually moves to the vendor: direct, through aggregator, or through a "loaded payment instrument" model.',
          'Reconciliation — matching redemptions to invoices/charges, handling credits, and providing Finance transparency.',
          'Support & Disputes — processes for lost code/card, transaction cancellation, consideration failure, or erroneous charge.',
          'Analytics & Governance — redemption reports, usage by category, anomaly monitoring, and compliance controls.',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Payment flow: why product people must understand it',
        id: 'payment-flow',
      },
      {
        type: 'paragraph',
        text: 'There\'s a basic flow of "how money moves": payment initiator, banks/networks, costs, and fees. Even if you\'re not a "payment company," the moment you operate a wallet/voucher, you\'re moving value and should understand the flow to plan correctly.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Security and PCI: when it\'s relevant in benefits infrastructure',
        id: 'security-pci',
      },
      {
        type: 'paragraph',
        text: 'PCI DSS is a global security standard for any entity that stores/processes/transmits card data, defining a "minimum standard" for data protection. PCI applies to anyone who accepts/processes cards, with compliance components (secure collection, secure storage, annual validation).',
      },
      {
        type: 'paragraph',
        text: 'The implication: if the organization aspires to be an infrastructure that connects to card/acquiring worlds, you need to decide architecturally whether you "touch" card data or use Tokenization/Hosted fields methods that reduce PCI burden.',
      },
      {
        type: 'heading',
        level: 2,
        text: 'Relevant Israeli regulation: validity, disclosure, loss/theft',
        id: 'israeli-regulation',
      },
      {
        type: 'paragraph',
        text: 'There are two important layers here:',
      },
      {
        type: 'heading',
        level: 3,
        text: 'Consumer Protection Law',
        id: 'consumer-law',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          '"Gift card" is defined by law, and if the issuer limits its validity, they must state issuance and expiry dates, and validity cannot be less than five years.',
          '"Credit voucher" must be valid for at least two years, and these provisions also apply to "gift vouchers."',
        ],
      },
      {
        type: 'heading',
        level: 3,
        text: 'Payment Services Regulations (2022)',
        id: 'payment-regulations',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Disclosure obligations for material terms (issuer identity, redemption method, vendor list, validity, loss/theft instructions).',
          'Obligation to recover balance in case of loss/theft of payment instrument (with reasonable effort), with an exception for paper-based instruments.',
          'Minimum validity periods (5 years for gift cards, 2 years for gift vouchers), with simple and convenient renewal upon holder request.',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Security and payment compliance checklist (for RFP use)',
        id: 'security-checklist',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'PCI DSS: compliance level, evidence, ongoing commitment.',
          'Encryption/Tokenization: whether payment data is stored with you or a third-party provider.',
          'Privacy: where data is stored/processed, retention and deletion policy, breach notification process.',
          'Fraud prevention: monitoring systems, dispute handling, adaptability.',
          'Disaster Recovery: RTO/RPO, drills.',
          'Auditability: logs, Finance export, investigation capability.',
        ],
      },
      {
        type: 'heading',
        level: 2,
        text: 'Useful templates',
        id: 'templates',
      },
      {
        type: 'heading',
        level: 3,
        text: 'RFP outline (section summary)',
        id: 'rfp-outline',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Background and objectives',
          'Use cases (holiday gifts, monthly budget, benefits club)',
          'Eligibility and identity (SSO, RBAC)',
          'Wallet/balances (Audit log, exports)',
          'Redemption engine (Online/Offline, QR, codes)',
          'Vendors and settlement (payment model, invoices, SLA)',
          'Security and compliance (PCI, privacy, incident response)',
          'Reports and measurement',
          'Implementation requirements (Sandbox, API docs, timeline)',
        ],
      },
      {
        type: 'heading',
        level: 3,
        text: 'Internal email template for IT/Compliance – project kickoff',
        id: 'kickoff-email',
      },
      {
        type: 'callout',
        text: 'Subject: Kickoff – Benefits & Payments Infrastructure (eligibility, wallet, redemption)\nProject goal: deploy a single system covering eligibility, balance allocation, redemption, and settlement.\nRequired from your side:\n• Initial security/privacy review\n• SSO and permissions requirements\n• Vendor assessment guidelines\nTarget: pilot within 6 weeks.',
      },
    ],
    faq: [
      {
        question: 'What\'s the difference between a "gift system" and "loyalty & payments infrastructure"?',
        answer:
          'A gift system is a use-case; infrastructure is a layer that enables gifts, ongoing budgets, benefits clubs, and settlement.',
      },
      {
        question: 'When is PCI DSS relevant in a benefits system?',
        answer:
          'When there\'s storage/processing/transmission of card data, or when entering acquiring worlds — PCI defines a minimum security standard.',
      },
      {
        question: 'What\'s the minimum validity for gift cards and gift vouchers?',
        answer:
          'Gift cards (if limited) must be at least 5 years; credit vouchers at least 2 years, and provisions apply to gift vouchers as well.',
      },
      {
        question: 'Must you allow balance recovery in case of loss?',
        answer:
          'Regulations require acting to recover balance with reasonable effort, with an exception for paper-based instruments.',
      },
    ],
  },
];
