import {
  Campaign, Lead, NotificationItem, Product, UserProfile,
  DynamicSurveyQuestion, PointOfInterest, Outlet, Customer,
  CampaignSurveyConfig, RouteAssignment, AttendanceRecord, LeadSurveyConfig,
} from '../types';

// ─── Date helpers (relative to "today" so mock data always demos sensibly) ────
const isoDate = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

// ─── User ─────────────────────────────────────────────────────────────────────
export const mockUser: UserProfile = {
  name: 'Amara Okafor',
  email: 'amara.okafor@fieldops.io',
  initials: 'AO',
  role: 'Field Lead Agent',
  territory: 'Lekki Phase 1',
  rank: 4,
  totalAgents: 38,
  profileCompletion: 75,
};

// ─── Survey Questions ─────────────────────────────────────────────────────────
export const mockMerchandisingQuestions: DynamicSurveyQuestion[] = [
  { id: 'm1', type: 'choice', required: true, question: 'Planogram compliance', options: ['Not checked', 'Yes, complete'] },
  { id: 'm2', type: 'choice', required: true, question: 'Shelf share secured', options: ['Not checked', 'Yes, complete'] },
  { id: 'm3', type: 'choice', required: true, question: 'POS materials displayed', options: ['Not checked', 'Yes, complete'] },
  { id: 'm4', type: 'choice', required: true, question: 'Pricing correct', options: ['Not checked', 'Yes, complete'] },
  { id: 'm5', type: 'photo', required: true, question: 'Capture shelf photo' },
  { id: 'm6', type: 'text', required: false, question: 'Competitor promo on the end cap...' },
];

// ─── Campaigns ────────────────────────────────────────────────────────────────
// Outlet-scoped, sectioned surveys (module: 'surveys') for the dynamic Outlet
// Surveys flow — mirrors the shape/content of mockLeadSurveys (same names,
// descriptions and durations) but as CampaignSurveyConfig entries assigned to
// campaigns' `surveys` arrays. `questions` is kept populated as a flattened
// fallback for any code that still reads the flat list.
const outletVisitFeedbackConfig: CampaignSurveyConfig = {
  id: 'sc-outlet-visit',
  name: 'Outlet visit feedback',
  module: 'surveys',
  description: 'Capture what the outlet looks like today so we can plan the next visit.',
  durationLabel: '~2 min',
  sections: [
    {
      id: 'sec-ov-status',
      name: 'Outlet status',
      description: 'Quick check on how the outlet is operating right now.',
      questions: [
        { id: 'ovc-q1', type: 'choice', question: 'Is the outlet currently open?', required: true, options: ['Yes', 'No'] },
        { id: 'ovc-q2', type: 'rating', question: 'Rate the overall shelf visibility', required: true },
        { id: 'ovc-q3', type: 'choice', question: 'Foot traffic during your visit', required: true, options: ['Low', 'Steady', 'Busy'] },
      ],
    },
    {
      id: 'sec-ov-merch',
      name: 'Merchandising',
      questions: [
        { id: 'ovc-q4', type: 'multi', question: 'Which materials are on display?', required: true, options: ['Poster', 'Standee', 'Shelf strip', 'Danglers'] },
        { id: 'ovc-q5', type: 'number', question: 'Flyers left in stock', required: true, unit: 'pcs' },
        { id: 'ovc-q6', type: 'text', question: 'Anything else the field team should know?', required: false, placeholder: 'Optional note for the supervisor' },
        { id: 'ovc-q7', type: 'select', question: 'Shelf position secured', required: true, options: ['Eye level', 'Mid shelf', 'Bottom shelf', 'Counter top'], placeholder: 'Select shelf position' },
        { id: 'ovc-q8', type: 'photo', question: 'Photo of the shelf display', required: true },
      ],
    },
  ],
  questions: [],
};
outletVisitFeedbackConfig.questions = outletVisitFeedbackConfig.sections!.flatMap((s) => s.questions);

const productAwarenessConfig: CampaignSurveyConfig = {
  id: 'sc-product-awareness',
  name: 'Product awareness',
  module: 'surveys',
  description: 'Understand how well shoppers recognise our products at this outlet.',
  durationLabel: '~3 min',
  sections: [
    {
      id: 'sec-pa-recognition',
      name: 'Recognition',
      questions: [
        { id: 'pac-q1', type: 'choice', question: 'How well does the shopkeeper recognise the brand?', required: true, options: ['Not at all', 'A little', 'Very well'] },
        { id: 'pac-q2', type: 'multi', question: 'Which products do shoppers ask about?', required: true, options: ['Personal loan', 'Credit card', 'Insurance', 'Savings'] },
        { id: 'pac-q3', type: 'rating', question: "Rate the shopkeeper's product knowledge", required: true },
      ],
    },
    {
      id: 'sec-pa-competition',
      name: 'Competition',
      questions: [
        { id: 'pac-q4', type: 'choice', question: 'Any competitor promo running now?', required: true, options: ['Yes', 'No'] },
        { id: 'pac-q5', type: 'text', question: 'Which competitor and what promo?', required: false, placeholder: 'e.g. FairMoney - 0% for 30 days' },
        { id: 'pac-q6', type: 'number', question: 'Estimated daily walk-ins', required: false, unit: 'people' },
        { id: 'pac-q7', type: 'select', question: 'Outlet tier', required: true, options: ['Platinum', 'Gold', 'Silver', 'Bronze'], placeholder: 'Select tier' },
        { id: 'pac-q8', type: 'photo', question: 'Photo evidence at the outlet', required: false },
      ],
    },
  ],
  questions: [],
};
productAwarenessConfig.questions = productAwarenessConfig.sections!.flatMap((s) => s.questions);

const loanInterestConfig: CampaignSurveyConfig = {
  id: 'sc-loan-interest',
  name: 'Loan interest',
  module: 'surveys',
  description: 'Gauge appetite for our personal loan product with this outlet.',
  durationLabel: '~2 min',
  sections: [
    {
      id: 'sec-li-interest',
      name: 'Interest',
      questions: [
        { id: 'lic-q1', type: 'choice', question: 'Would the shopkeeper apply for a loan?', required: true, options: ['Yes', 'No'] },
        { id: 'lic-q2', type: 'number', question: 'Preferred loan amount', required: true, unit: '₦' },
        { id: 'lic-q3', type: 'choice', question: 'Preferred tenure', required: true, options: ['3 months', '6 months', '12 months', 'Longer'] },
        { id: 'lic-q4', type: 'text', question: 'Best time to follow up', required: false, placeholder: 'e.g. Weekday mornings' },
      ],
    },
  ],
  questions: [],
};
loanInterestConfig.questions = loanInterestConfig.sections!.flatMap((s) => s.questions);

const merchandisingConfig: CampaignSurveyConfig = {
  id: 'sc-merch',
  name: 'Merchandising',
  module: 'merchandising',
  questions: mockMerchandisingQuestions,
};

export const mockCampaigns: Campaign[] = [
  {
    id: 'c1',
    name: 'Renmoney Personal Loan Promo',
    client: 'Renmoney',
    type: 'Sales Drive',
    category: 'Sales',
    progress: 68,
    target: '60 applications',
    color: '#6D5BD0',
    beat: 'Lekki Phase 1',
    description: 'Drive personal loan applications across Lekki and V.I. outlets. Capture leads, run awareness surveys, and track conversions.',
    startDate: 'Aug 1',
    endDate: 'Sep 7',
    // Pipeline/leads campaign — outlet execution modules (sales, orders,
    // merchandising) are never part of a leads-type campaign; only survey
    // capture applies during an outlet stop. 'leads' drives the Dashboard's
    // Leads + Pipeline Quick Access entries (module-driven, not ctaType).
    modules: ['leads', 'surveys', 'stock', 'photo'],
    surveys: [outletVisitFeedbackConfig, productAwarenessConfig, loanInterestConfig],
    productIds: ['p1', 'p2', 'p3'],
    ctaType: 'leads',
    dashboard: { template: 'default', widgets: ['total-leads', 'new-leads', 'conversion-rate', 'pipeline-value', 'leads-by-stage', 'agent-performance'] },
  },
  {
    id: 'c2',
    name: 'Silver Card Rollout',
    client: 'Renmoney',
    type: 'Execution',
    category: 'Mixed',
    progress: 42,
    target: '25 outlets',
    color: '#1A9B8F',
    beat: 'Victoria Island',
    description: 'Onboard retail outlets to the new Silver Card credit card program. Product placement audits and lead capture at every stop.',
    startDate: 'Aug 10',
    endDate: 'Aug 31',
    // Execution campaign, sales-focused: New Sale + New Survey quick actions,
    // no merchandising — matches the "Silver Card Rollout" reference flow.
    modules: ['sales', 'orders', 'surveys', 'stock', 'photo'],
    surveys: [outletVisitFeedbackConfig, productAwarenessConfig, loanInterestConfig],
    productIds: ['p2'],
    ctaType: 'outlets',
    dashboard: { template: 'default', widgets: ['total-leads', 'new-leads', 'conversion-rate', 'pipeline-value', 'leads-by-stage', 'agent-performance'] },
  },
  {
    id: 'c3',
    name: 'Q4 Visibility & Audit Sweep',
    client: 'FieldOps',
    type: 'Execution',
    category: 'Survey',
    progress: 25,
    target: '40 outlets',
    color: '#D4890A',
    beat: 'Lekki Phase 1',
    description: 'Shelf visibility and planogram compliance audits across the beat. No sales targets — focus on audit quality.',
    startDate: 'Aug 5',
    endDate: 'Sep 16',
    // Execution campaign, audit-focused: New Survey + New Merchandising quick
    // actions, no sales/orders — matches the "Q4 Visibility & Audit Sweep" flow.
    modules: ['surveys', 'merchandising', 'photo'],
    surveys: [outletVisitFeedbackConfig, productAwarenessConfig, loanInterestConfig, merchandisingConfig],
    ctaType: 'outlets',
    dashboard: { template: 'default', widgets: ['total-leads', 'new-leads', 'conversion-rate', 'pipeline-value', 'leads-by-stage', 'agent-performance'] },
  },
];

// ─── Leads ────────────────────────────────────────────────────────────────────
export const mockLeads: Lead[] = [
  {
    id: 'l1',
    name: 'Mariam Bello',
    company: "Mariam's Pantry",
    phone: '+234 803 555 0192',
    email: 'mariam@pantry.ng',
    stage: 'Qualified',
    score: 82,
    next: 'Follow up tomorrow at 10:00 AM',
    nextActionDate: isoDate(-2), // overdue
    value: '₦180,000',
    source: 'Store visit',
    pipeline: 'Retail Pipeline',
    notes: 'Interested in stocking 10 cases of FieldFresh 1L.',
    createdAt: isoDate(-6),
    lastContactDate: isoDate(-3),
  },
  {
    id: 'l2',
    name: 'Chinedu Okeke',
    company: 'Cedar Stores',
    phone: '+234 806 222 7431',
    email: 'chinedu@cedarstores.com',
    stage: 'Contacted',
    score: 64,
    next: 'Call today at 2:00 PM',
    nextActionDate: isoDate(0), // today
    value: '₦95,000',
    source: 'Referral',
    pipeline: 'Retail Pipeline',
    notes: 'Requested sample kit before placing bulk order.',
    createdAt: isoDate(-3),
    lastContactDate: isoDate(-1),
  },
  {
    id: 'l3',
    name: 'Ayo Martins',
    company: 'Daily Basket',
    phone: '+234 809 111 5512',
    stage: 'New',
    score: 45,
    next: 'Visit scheduled for Thursday',
    nextActionDate: isoDate(3), // future
    value: '₦65,000',
    source: 'Store visit',
    pipeline: 'Wholesale Pipeline',
    notes: 'New outlet opened last week.',
    createdAt: isoDate(-1),
    lastContactDate: isoDate(-1),
  },
];

// ─── Products ─────────────────────────────────────────────────────────────────
// Matches the active campaign (Renmoney Personal Loan Promo) — these are loan
// application "products" plus merchandising give-aways, not physical goods.
export const mockProducts: Product[] = [
  {
    id: 'p1', name: 'Renmoney Loan ₦100k', sku: 'RML-100', price: 100000, stock: 40, category: 'Loans',
    warehouse: 'Campaign Allocation', unitsPerCase: 10, minStock: 10, unit: 'application', isMsl: true,
    description: 'Personal loan starter tier.',
  },
  {
    id: 'p2', name: 'Renmoney Loan ₦250k', sku: 'RML-250', price: 250000, stock: 22, category: 'Loans',
    warehouse: 'Campaign Allocation', unitsPerCase: 10, minStock: 8, unit: 'application', isMsl: true,
    description: 'Mid-tier personal loan.',
  },
  {
    id: 'p3', name: 'Renmoney Loan ₦500k', sku: 'RML-500', price: 500000, stock: 12, category: 'Loans',
    warehouse: 'Campaign Allocation', unitsPerCase: 5, minStock: 5, unit: 'application',
    description: 'Top-tier personal loan.',
  },
  {
    id: 'p4', name: 'Brochures - Silver', sku: 'MRK-BR', price: 0, stock: 22, category: 'Merchandising',
    warehouse: 'Campaign Allocation', unitsPerCase: 12, minStock: 30, unit: 'pack',
    description: 'Point-of-sale printed brochures.',
  },
  {
    id: 'p5', name: 'Branded Pens', sku: 'MRK-PN', price: 0, stock: 200, category: 'Merchandising',
    warehouse: 'Campaign Allocation', unitsPerCase: 24, minStock: 50, unit: 'pack', isMsl: true,
    description: 'Give-away pens for outlets.',
  },
];

// ─── Customers ────────────────────────────────────────────────────────────────
export const mockCustomers: Customer[] = [
  { id: 'cu1', name: 'Mariam Bello',   phone: '+234 803 555 0192', email: 'mariam@pantry.ng',         company: "Mariam's Pantry" },
  { id: 'cu2', name: 'Chinedu Okeke',  phone: '+234 806 222 7431', email: 'chinedu@cedarstores.com',  company: 'Cedar Stores'    },
  { id: 'cu3', name: 'Ayo Martins',    phone: '+234 809 111 5512',                                    company: 'Daily Basket'    },
  { id: 'cu4', name: 'Funke Adeyemi',  phone: '+234 811 300 5600', email: 'funke@greenmart.ng',       company: 'GreenMart'       },
  { id: 'cu5', name: 'Ibrahim Salisu', phone: '+234 802 774 8821',                                    company: 'Salisu Stores'   },
  { id: 'cu6', name: 'Ngozi Eze',      phone: '+234 706 888 3312', email: 'ngozi@freshbench.ng',      company: 'FreshBench'      },
];

// ─── Outlets ──────────────────────────────────────────────────────────────────
export const mockOutlets: Outlet[] = [
  {
    id: 'o1',
    name: 'Corner Store',
    type: 'Supermarket',
    area: 'Ikoyi',
    address: '14 Bourdillon Road, Ikoyi, Lagos',
    phone: '+234 801 000 0000',
    ownerName: 'Mr. Emeka Obi',
    ownerPhone: '+234 802 000 0000',
    isOpen: false,
    distance: '2.4 km',
    notes: 'Manager usually arrives at 10 AM. Back entrance on weekdays.',
    status: 'pending',
    gps: '6.4550, 3.4320',
    campaignId: 'c2',
  },
  {
    id: 'o2',
    name: 'Freshline Mini',
    type: 'Supermarket',
    area: 'Victoria Island',
    address: '3 Akin Adesola St, Victoria Island',
    phone: '+234 801 000 0000',
    ownerName: 'Mrs. Chika Eze',
    ownerPhone: '+234 803 000 0001',
    isOpen: false,
    distance: '0.8 km',
    notes: 'Products are usually stocked near the refrigerators section.',
    status: 'pending',
    gps: '6.4281, 3.4219',
    campaignId: 'c2',
  },
  {
    id: 'o3',
    name: 'MaxiMart',
    type: 'Supermarket',
    area: 'Lekki Phase 1',
    address: 'Admiralty Way, Lekki Phase 1',
    phone: '+234 801 000 0002',
    ownerName: 'Mr. Bayo Adewale',
    ownerPhone: '+234 804 000 0002',
    isOpen: false,
    distance: '0.4 km',
    notes: '',
    status: 'pending',
    gps: '6.4474, 3.4723',
    campaignId: 'c2',
  },
  {
    id: 'o4',
    name: 'QuickShop Express',
    type: 'Supermarket',
    area: 'Oniru',
    address: '12 Marine Rd, Oniru, Lekki',
    phone: '+234 801 000 0003',
    ownerName: 'Ms. Aisha Bello',
    ownerPhone: '+234 805 000 0003',
    isOpen: false,
    distance: '1.2 km',
    notes: 'New outlet, first time visit.',
    status: 'pending',
    gps: '6.4442, 3.4501',
    campaignId: 'c2',
  },
];

// ─── Day / Route Assignments ──────────────────────────────────────────────────
export const mockRouteAssignments: RouteAssignment[] = [
  { date: isoDate(-1), routeName: 'Ikoyi Loop',       outletIds: ['o1'],      leadIds: ['l1'] },
  { date: isoDate(0),  routeName: 'Lekki-VI Circuit', outletIds: ['o2', 'o3'], leadIds: ['l2'] },
  { date: isoDate(1),  routeName: 'Oniru Sweep',      outletIds: ['o4'],      leadIds: ['l3'] },
];

// ─── Attendance (month-to-date, weekdays only) ────────────────────────────────
export const mockAttendanceRecords: AttendanceRecord[] = (() => {
  const records: AttendanceRecord[] = [];
  const today = new Date();
  const cursor = new Date(today.getFullYear(), today.getMonth(), 1);

  let dayIndex = 0;
  while (cursor <= today) {
    const dow = cursor.getDay(); // 0 = Sunday, 6 = Saturday
    if (dow !== 0 && dow !== 6) {
      const iso = cursor.toISOString().slice(0, 10);
      // A light, deterministic pattern so the demo shows a few different statuses.
      // Days with no pushed record are implicitly "absent" (see getAttendanceBreakdown:
      // absent = 22 working days - recorded attendance, per the dashboard spec).
      const cyclePos = dayIndex % 9;
      if (cyclePos === 8) {
        // no record — implicit absence
      } else if (cyclePos === 6) {
        records.push({ id: `att-${iso}`, date: iso, status: 'late', clockInTime: '10:20 AM', clockOutTime: '5:30 PM' });
      } else if (cyclePos === 4) {
        records.push({ id: `att-${iso}`, date: iso, status: 'half-day', clockInTime: '9:00 AM', clockOutTime: '1:15 PM' });
      } else {
        records.push({ id: `att-${iso}`, date: iso, status: 'present', clockInTime: '8:55 AM', clockOutTime: '5:45 PM' });
      }
      dayIndex += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return records;
})();

// ─── Notifications ────────────────────────────────────────────────────────────
export const mockNotifications: NotificationItem[] = [
  {
    id: 'n1',
    title: 'New Assignment',
    body: 'Renmoney Personal Loan Promo campaign has been assigned to your territory.',
    time: '10m',
    type: 'assignment',
    color: '#6D5BD0',
    read: false,
  },
  {
    id: 'n2',
    title: 'Low Stock Alert',
    body: 'Active Energy 330ml inventory is below your 15 unit threshold.',
    time: '1h',
    type: 'stock',
    color: '#D4890A',
    read: false,
  },
  {
    id: 'n3',
    title: 'Geofence Compliance',
    body: 'You successfully entered assigned territory: Lekki Phase 1.',
    time: '2h',
    type: 'geofence',
    color: '#1A9E60',
    read: true,
  },
  {
    id: 'n4',
    title: 'EOD Summary Reminder',
    body: 'Please complete your daily stock & shift summary by 6:00 PM.',
    time: '4h',
    type: 'eod',
    color: '#1A9B8F',
    read: true,
  },
];

// ─── Promotions ───────────────────────────────────────────────────────────────
export const mockPromos = [
  { label: 'None',         pct: 0  },
  { label: '5% Intro',     pct: 5  },
  { label: '10% Bulk',     pct: 10 },
  { label: '15% Launch',   pct: 15 },
];

// ─── Lead-Scoped Surveys ──────────────────────────────────────────────────────
export const mockLeadSurveys: LeadSurveyConfig[] = [
  {
    id: 'lsv-outlet-visit',
    name: 'Outlet visit feedback',
    description: 'Capture what the outlet looks like today so we can plan the next visit.',
    durationLabel: '~2 min',
    sections: [
      {
        id: 'sec-status',
        name: 'Outlet status',
        description: 'Quick check on how the outlet is operating right now.',
        questions: [
          { id: 'ov-q1', type: 'choice', question: 'Is the outlet currently open?', required: true, options: ['Yes', 'No'] },
          { id: 'ov-q2', type: 'rating', question: 'Rate the overall shelf visibility', required: true },
          { id: 'ov-q3', type: 'choice', question: 'Foot traffic during your visit', required: true, options: ['Low', 'Steady', 'Busy'] },
        ],
      },
      {
        id: 'sec-merch',
        name: 'Merchandising',
        questions: [
          { id: 'ov-q4', type: 'multi', question: 'Which materials are on display?', required: true, options: ['Poster', 'Standee', 'Shelf strip', 'Danglers'] },
          { id: 'ov-q5', type: 'number', question: 'Flyers left in stock', required: true, unit: 'pcs' },
          { id: 'ov-q6', type: 'text', question: 'Anything else the field team should know?', required: false },
          { id: 'ov-q7', type: 'select', question: 'Shelf position secured', required: true, options: ['Eye level', 'Top shelf', 'Bottom shelf', 'End cap'] },
          { id: 'ov-q8', type: 'photo', question: 'Photo of the shelf display', required: true },
        ],
      },
    ],
  },
  {
    id: 'lsv-product-awareness',
    name: 'Product awareness',
    description: 'Understand how well shoppers recognise our products at this outlet.',
    durationLabel: '~3 min',
    sections: [
      {
        id: 'sec-recognition',
        name: 'Recognition',
        questions: [
          { id: 'pa-q1', type: 'choice', question: 'How well does the shopkeeper recognise the brand?', required: true, options: ['Not at all', 'A little', 'Very well'] },
          { id: 'pa-q2', type: 'multi', question: 'Which products do shoppers ask about?', required: true, options: ['Personal loan', 'Credit card', 'Insurance', 'Savings'] },
          { id: 'pa-q3', type: 'rating', question: "Rate the shopkeeper's product knowledge", required: true },
        ],
      },
      {
        id: 'sec-competition',
        name: 'Competition',
        questions: [
          { id: 'pa-q4', type: 'choice', question: 'Any competitor promo running now?', required: true, options: ['Yes', 'No'] },
          { id: 'pa-q5', type: 'text', question: 'Which competitor and what promo?', required: false },
          { id: 'pa-q6', type: 'number', question: 'Estimated daily walk-ins', required: false, unit: 'people' },
          { id: 'pa-q7', type: 'select', question: 'Outlet tier', required: true, options: ['Tier 1', 'Tier 2', 'Tier 3'] },
          { id: 'pa-q8', type: 'photo', question: 'Photo evidence at the outlet', required: true },
        ],
      },
    ],
  },
  {
    id: 'lsv-loan-interest',
    name: 'Loan interest',
    description: 'Gauge appetite for our personal loan product with this outlet.',
    durationLabel: '~2 min',
    sections: [
      {
        id: 'sec-interest',
        name: 'Interest',
        questions: [
          { id: 'li-q1', type: 'choice', question: 'Would the shopkeeper apply for a loan?', required: true, options: ['Yes', 'No'] },
          { id: 'li-q2', type: 'number', question: 'Preferred loan amount', required: true, unit: '₦' },
          { id: 'li-q3', type: 'choice', question: 'Preferred tenure', required: true, options: ['3 months', '6 months', '12 months', 'Longer'] },
          { id: 'li-q4', type: 'text', question: 'Best time to follow up', required: false },
        ],
      },
    ],
  },
];

// ─── Points of Interest (legacy) ──────────────────────────────────────────────
export const mockPointsOfInterest: PointOfInterest[] = [
  { id: 'poi1', name: 'FreshMart Lekki', distance: '0.4 km', address: 'Admiralty Way, Lekki Phase 1', status: 'Visited' },
  { id: 'poi2', name: 'Daily Basket',    distance: '0.8 km', address: 'Freedom Way, Lekki',            status: 'Pending' },
  { id: 'poi3', name: 'Cedar Stores',    distance: '1.2 km', address: 'Bisola Durosinmi Etti Dr',       status: 'Pending' },
];

export const mockDelay = (ms = 500) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const demoAuthService = async (email: string) => {
  await mockDelay(600);
  return { success: true, email };
};

export const submitMockData = async (data?: any) => {
  await mockDelay(500);
  return { success: true, timestamp: new Date().toISOString() };
};

export const generateId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const generateInvoiceRef = () =>
  `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`;

export const generateOrderRef = () =>
  `ORD-${new Date().getFullYear()}-${Math.floor(Math.random() * 90000 + 10000)}`;
