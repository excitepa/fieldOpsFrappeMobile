// ─── Route Names ──────────────────────────────────────────────────────────────
export type RouteName =
  | 'splash'
  | 'login'
  | 'forgot'
  | 'campaignSelect'
  | 'clockIn'
  | 'home'
  | 'dashboard'
  | 'campaigns'
  | 'campaignDetail'
  | 'attendance'
  | 'attendanceSuccess'
  | 'leads'
  | 'leadForm'
  | 'leadDetail'
  | 'leadUpdate'
  | 'leadSuccess'
  | 'editLead'
  | 'leadSurveys'
  | 'leadSurveyDetail'
  | 'leadSurveyForm'
  | 'leadSurveyReview'
  | 'pipelineOverview'
  | 'inventory'
  | 'reconcile'
  | 'productCatalog'
  | 'productDetail'
  | 'notifications'
  | 'notificationsEmpty'
  | 'profile'
  | 'profileDetail'
  | 'draftsList'
  | 'sync'
  | 'eodSummary'
  | 'ordersList'
  | 'transactionDetail'
  | 'outletTransactions'
  // Outlet workspace
  | 'outlets'
  | 'outletDetail'
  | 'addOutlet'
  | 'editOutlet'
  | 'outletActivity'
  | 'saleReceipt'
  | 'outletSaleSuccess'
  | 'orderSuccess'
  | 'outletSurveySuccess'
  | 'surveySuccess'
  | 'outletSurveys'
  | 'outletSurveyForm'
  | 'outletSurveyReview';

// ─── User Profile ──────────────────────────────────────────────────────────────
export interface UserProfile {
  name: string;
  email: string;
  initials: string;
  role: string;
  territory: string;
  rank: number;
  totalAgents: number;
  profileCompletion: number;
}

// ─── Campaign ─────────────────────────────────────────────────────────────────
export type CampaignCategory = 'Sales' | 'Orders' | 'Survey' | 'Merchandising' | 'Mixed';

export interface Campaign {
  id: string;
  name: string;
  client: string; // short client/brand label shown on campaign selection, e.g. "Renmoney"
  type: string;
  category: CampaignCategory;
  progress: number;
  target: string;
  color: string;
  beat: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  modules?: CampaignModule[];
  surveys?: CampaignSurveyConfig[];
  /** Restricts the Sale/Order product catalog to just these product ids — omit to allow the full catalog. */
  productIds?: string[];
  ctaType?: 'leads' | 'outlets';
  dashboard?: CampaignDashboardConfig;
}

export type DashboardWidgetId =
  // CRM / Pipeline
  | 'total-leads' | 'new-leads' | 'conversion-rate' | 'pipeline-value' | 'leads-by-stage' | 'agent-performance'
  // Sales / Non-pipeline
  | 'outlets-visited' | 'orders-created' | 'sales-value' | 'products-sold' | 'target-achievement'
  // Merchandising
  | 'outlet-visits' | 'completed-audits' | 'compliance' | 'shelf-availability' | 'photo-captures' | 'pending-activities';

export interface CampaignDashboardConfig {
  template?: 'default' | 'merchandising';
  widgets: DashboardWidgetId[];
}

// Not a strict union — the backend's actual set of module strings isn't fully confirmed
// (e.g. it may include 'leads'/'customers' alongside the ones already known), so this stays
// an open string type rather than a hardcoded allowlist that could silently drop real values.
export type CampaignModule = string;

export interface CampaignSurveyConfig {
  id: string;
  name: string;
  module: 'surveys' | 'merchandising';
  questions: DynamicSurveyQuestion[];
  /** Optional sectioned structure (reuses the Lead-survey shape) for the dynamic
   *  Outlet Surveys flow (module: 'surveys'). When present, screens should prefer
   *  this over the flat `questions` list for rendering/progress/counting — the
   *  `questions` field is still kept populated (flattened) for back-compat with
   *  any code that reads it directly (e.g. the merchandising SurveyTab branch,
   *  which never sets `sections` and keeps using flat `questions` as before). */
  sections?: LeadSurveySection[];
  description?: string;
  durationLabel?: string; // e.g. "~2 min"
}

// ─── Lead ─────────────────────────────────────────────────────────────────────
export type LeadStage = 'New' | 'Contacted' | 'Qualified' | 'Proposal Sent' | 'Negotiation' | 'Converted' | 'Lost';

export interface Lead {
  id: string;
  name: string;
  company: string; // the outlet/business this lead is tied to
  parentCompany?: string; // the lead's own organization, if distinct from the outlet
  phone: string;
  email?: string;
  position?: string;
  address?: string;
  stage: LeadStage;
  score: number;
  next: string;
  nextActionDate?: string; // ISO yyyy-mm-dd — drives Overdue Follow-ups + Day/Route filtering
  createdAt?: string; // ISO yyyy-mm-dd — drives "Leads created today" on End of Day
  lastContactDate?: string; // ISO yyyy-mm-dd
  value: string;
  source?: string;
  pipeline?: string;
  notes?: string;
  gps?: string;
}

// ─── Product / Inventory ──────────────────────────────────────────────────────
export interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  category?: string;
  warehouse: string;
  unitsPerCase: number;
  imageUrl?: string;
  description?: string;
  minStock?: number;
  /** Display unit word for stock counts, e.g. "application" or "pack". */
  unit?: string;
  /** Campaign-highlighted product — shown with a "Focus product" badge on Stock Request. */
  focusProduct?: boolean;
}

// ─── Stock Movements ──────────────────────────────────────────────────────────
export type StockMovementType = 'sale' | 'adjustment' | 'reconciliation';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  qtyChange: number; // negative for decreases
  reason?: string;
  outletId?: string;
  outletName?: string;
  timestamp: string;
}

// ─── Notification ─────────────────────────────────────────────────────────────
export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  time: string;
  type: 'assignment' | 'geofence' | 'stock' | 'eod' | 'system';
  color: string;
  read: boolean;
}

// ─── Survey ───────────────────────────────────────────────────────────────────
export type QuestionType = 'choice' | 'multi' | 'select' | 'rating' | 'text' | 'number' | 'photo' | 'gps';

export interface DynamicSurveyQuestion {
  id: string;
  type: QuestionType;
  question: string;
  required?: boolean;
  options?: string[];
  unit?: string; // display suffix for 'number' questions, e.g. "pcs", "people"
  /** Custom placeholder text — for 'select' questions this is the picker trigger
   *  label (e.g. "Select shelf position", falls back to `Select ${question}`);
   *  for 'text' questions this is the input placeholder (e.g. "e.g. Weekday
   *  mornings", falls back to "Optional note..."). */
  placeholder?: string;
}

// ─── Lead-Scoped Surveys ────────────────────────────────────────────────────────
export interface LeadSurveySection {
  id: string;
  name: string;
  description?: string;
  questions: DynamicSurveyQuestion[];
}

export interface LeadSurveyConfig {
  id: string;
  name: string;
  description: string;
  durationLabel: string; // e.g. "~2 min"
  sections: LeadSurveySection[];
}

export interface LeadSurveyAnswer {
  questionId: string;
  question: string;
  answer: string | string[] | number | null;
}

export interface LeadSurveyResponse {
  id: string;
  leadId: string;
  surveyConfigId: string;
  answers: LeadSurveyAnswer[];
  submittedAt: string;
}

// ─── Outlet ───────────────────────────────────────────────────────────────────
export type OutletStatus = 'pending' | 'visited' | 'skipped';

export interface Outlet {
  id: string;
  name: string;
  type: string;
  /** Outlet sub-channel classification (e.g. "Modern Trade", "Key Account"). */
  category?: string;
  area: string;
  address: string;
  phone: string;
  ownerName?: string;
  ownerPhone?: string;
  isOpen: boolean;
  distance: string;
  notes?: string;
  status: OutletStatus;
  gps?: string;
  photoUri?: string;
  campaignId: string;
  /** True when this outlet is on the agent's web-planned beat/route for today. */
  isScheduledToday?: boolean;
  /** ISO yyyy-mm-dd — the date this outlet's beat stop is scheduled for. */
  scheduledDate?: string;
  /** The beat/route name this outlet's stop belongs to, e.g. "Lekki Phase 1 Route". */
  beatName?: string;
  /** Visit order within that beat's stop list — lower comes first. */
  sequence?: number;
}

// ─── Customer ─────────────────────────────────────────────────────────────────
export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
}

// ─── Outlet Activities ────────────────────────────────────────────────────────
export type PromoDiscount = { label: string; pct: number };

export interface OutletSale {
  id: string;
  outletId: string;
  campaignId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  customerId: string;
  customerName: string;
  promoLabel?: string;
  timestamp: string;
  invoiceRef: string;
}

export interface OutletOrder {
  id: string;
  outletId: string;
  campaignId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  customerId: string;
  customerName: string;
  status: 'Pending' | 'Confirmed' | 'Delivered';
  timestamp: string;
  orderRef: string;
}

export interface SurveyAnswer {
  questionId: string;
  question: string;
  answer: string | string[] | number | null;
}

export interface OutletSurvey {
  id: string;
  outletId: string;
  campaignId: string;
  surveyConfigId?: string;
  surveyName?: string;
  answers: SurveyAnswer[];
  isDraft: boolean;
  timestamp: string;
}

export interface SkipRecord {
  id: string;
  outletId: string;
  reason: string;
  note?: string;
  gps: string;
  timestamp: string;
}

// ─── Attendance ───────────────────────────────────────────────────────────────
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'half-day';

export interface AttendanceRecord {
  id: string;
  date: string; // ISO yyyy-mm-dd
  status: AttendanceStatus;
  clockInTime?: string; // e.g. "9:05 AM"
  clockOutTime?: string; // e.g. "1:30 PM" — before 2 PM implies half-day
}

// ─── Cart / Draft ─────────────────────────────────────────────────────────────
export interface CartLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  discount: number;
  promoLabel?: string;
}

export interface Draft {
  id: string;
  mode: 'sale' | 'order';
  outletId: string;
  outletName: string;
  customerId?: string;
  customerName?: string;
  cart: CartLine[];
  promoLabel?: string;
  updatedAt: string;
  pendingSync: true;
}

// ─── Lead Draft (offline queue) ──────────────────────────────────────────────
export interface LeadDraft {
  id: string;
  campaignId: string;
  name: string;
  company: string;
  phone: string;
  email?: string;
  address?: string;
  source?: string;
  notes?: string;
  parentCompany?: string;
  leadValue?: string;
  pipeline?: string;
  createdAt: string;
  pendingSync: true;
}

// ─── Photo Capture ────────────────────────────────────────────────────────────
export interface OutletPhotoCapture {
  id: string;
  outletId: string;
  campaignId: string;
  photoUri: string;
  timestamp: string;
}

// ─── Day / Route Assignment ───────────────────────────────────────────────────
export interface RouteAssignment {
  date: string; // ISO yyyy-mm-dd
  routeName: string;
  outletIds: string[];
  leadIds: string[];
}

// ─── Point of Interest (legacy) ───────────────────────────────────────────────
export interface PointOfInterest {
  id: string;
  name: string;
  distance: string;
  address: string;
  status: string;
}
