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
  | 'outlets-visited' | 'orders-created' | 'sales-value' | 'sales-count' | 'products-sold' | 'target-achievement'
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
  /** The campaign's survey to fill after an outlet is edited (at most one per campaign). */
  afterOutletEdit?: boolean;
}

// ─── Lead ─────────────────────────────────────────────────────────────────────
/**
 * A funnel stage, named as the backend names it: Prospect, Qualified,
 * Opportunity, Proposal, Won, Lost, plus Customer and Archived (set on the
 * web only). The list comes from get_lead_stages — see src/utils/leadStages.ts.
 */
export type LeadStage = string;

/** One stage of the backend's list (get_lead_stages). */
export interface LeadStageInfo {
  name: LeadStage;
  order: number;
  /** Won and Lost: a move out of one needs a supervisor's approval. */
  isFinal: boolean;
  /** False for the web-only stages (Customer, Archived). */
  agentCanSet: boolean;
}

/** A request to move a lead back a stage, waiting for a supervisor. */
export interface PendingStageRequest {
  id: string;
  toStage: LeadStage;
  /** As the backend sends it (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS). */
  requestedOn?: string;
}

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
  /** A move back a stage the agent asked for, still waiting for approval. */
  pendingStageRequest?: PendingStageRequest;
}

// ─── Product / Inventory ──────────────────────────────────────────────────────
/** One unit a product sells in (its stock unit, a pack, a carton...), as get_items sends it. */
export interface ProductUnit {
  uom: string;
  /** Stock units in one of this unit — 1 for the stock unit. */
  conversionFactor: number;
  /** Price for one of this unit. */
  price: number;
  mustBeWholeNumber: boolean;
}

/** A promotion earned by buying a product (it's the promotion's qualifying item), as get_items sends it. */
export interface ProductPromotion {
  id: string;
  name: string;
  /** Buy this many of `uom` (whole multiples count)... */
  buyQuantity: number;
  uom: string;
  /** ...to get `freeQuantity` of `rewardItem`, in `freeUom`, free. */
  rewardItem: string;
  rewardItemName: string;
  freeQuantity: number;
  freeUom: string;
  /** Applies only with the right promo code — which only the server can check. */
  requiresCode: boolean;
  /** YYYY-MM-DD, or undefined for no end date. */
  validTo?: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  /** Price for one stock unit. */
  price: number;
  /** Always in stock units. */
  stock: number;
  category?: string;
  warehouse: string;
  unitsPerCase: number;
  imageUrl?: string;
  description?: string;
  minStock?: number;
  /** The stock unit's name, e.g. "Unit", "application" or "pack". */
  unit?: string;
  brand?: string;
  size?: string;
  /** Default sales unit — listed first on the Sale/Order steppers. */
  salesUom?: string;
  /** Every unit it sells in, stock unit first. Missing from an older backend
   *  (and mock data): it then sells only in its stock unit at `price` — see
   *  getProductUnits. */
  units?: ProductUnit[];
  /** Promotions earned by buying this product. */
  promotions?: ProductPromotion[];
  /** The server's stock status for the agent ("In Stock", "Low Stock", "Out of Stock"), where it sends one. */
  stockStatus?: string;
  /** On the must-stock list (is_msl): badged "MSL", listed first, and in the
   *  reminder before a sale/order is submitted without it. */
  isMsl?: boolean;
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
  /** Its Outlet Type, Outlet Channel, Outlet Sub Channel and distributor, by id and name — from a backend that sends them. */
  outletTypeId?: string;
  outletTypeName?: string;
  channelId?: string;
  channelName?: string;
  subChannelId?: string;
  subChannelName?: string;
  distributorId?: string;
  distributorName?: string;
  /** A new location the agent sent, waiting for a supervisor's approval; the outlet keeps its saved one until then. */
  pendingLocationRequest?: { id: string; latitude: number; longitude: number; requestedOn?: string };
  /** The campaign's after-edit survey, due since the outlet was last edited; it can't be edited again until it's filled. */
  surveyDue?: SurveyDue;
}

/** A survey an outlet is waiting for after it was edited. */
export interface SurveyDue {
  surveyId: string;
  surveyName: string;
  since?: string;
}

/** A choice from the backend's master data, kept by id: an outlet type, channel, sub-channel or distributor. */
export interface MasterOption {
  id: string;
  name: string;
  /** A sub-channel's channel (its id). */
  parent?: string;
  /** A distributor's phone number. */
  phone?: string;
}

/**
 * The Add/Edit Outlet pickers' lists as last loaded, kept on the device so
 * the pickers work offline. A list is unset until it has loaded once.
 */
export interface OutletFormOptions {
  types?: MasterOption[];
  channels?: MasterOption[];
  subChannels?: MasterOption[];
  distributors?: MasterOption[];
  /** The distributor to preselect, when the agent has exactly one. */
  defaultDistributorId?: string;
}

// ─── Geofence ─────────────────────────────────────────────────────────────────
/** The agent's geofence (get_my_geofence), kept on the device so a sale can be checked offline. */
export interface GeofenceConfig {
  /** How far from an outlet's saved location a sale still counts as at the outlet, in meters. */
  toleranceM: number;
  /** The agent's active territories (GeoJSON); with none, they're never outside one. */
  territories: { name: string; geojson: any }[];
  /** The agent may work outside their territory. */
  allowedOutside: boolean;
}

/** Where a sale was recorded, sent with it (and kept on its offline draft) for the server's check. */
export interface SaleLocation {
  lat?: number;
  lng?: number;
  /** The fix's accuracy, in meters. */
  accuracy?: number;
  /** When the fix was taken: local time, "YYYY-MM-DD HH:MM:SS". */
  capturedAt?: string;
  /** Why the agent recorded the sale away from the outlet or outside their territory. */
  outsideReason?: string;
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
export interface OutletSale {
  id: string;
  outletId: string;
  campaignId: string;
  productId: string;
  productName: string;
  /** Quantity in `uom` (stock units when there's no uom). */
  quantity: number;
  /** The unit the line was sold in; missing on records from before units. */
  uom?: string;
  conversionFactor?: number;
  /** The line's quantity in stock units. */
  stockQty?: number;
  /** Price for one `uom` (0 for free goods). */
  unitPrice: number;
  total: number;
  /** Free goods a promotion added — their own line, at no charge. */
  isFree?: boolean;
  promotionName?: string;
  customerId: string;
  customerName: string;
  timestamp: string;
  invoiceRef: string;
}

export interface OutletOrder {
  id: string;
  outletId: string;
  campaignId: string;
  productId: string;
  productName: string;
  /** Quantity in `uom` (stock units when there's no uom). */
  quantity: number;
  /** The unit the line was ordered in; missing on records from before units. */
  uom?: string;
  conversionFactor?: number;
  /** The line's quantity in stock units. */
  stockQty?: number;
  /** Price for one `uom` (0 for free goods). */
  unitPrice: number;
  total: number;
  /** Free goods a promotion added — their own line, at no charge. */
  isFree?: boolean;
  promotionName?: string;
  customerId: string;
  customerName: string;
  status: 'Pending' | 'Confirmed' | 'Delivered';
  timestamp: string;
  orderRef: string;
}

export interface SurveyAnswer {
  questionId: string;
  question: string;
  /** Needed to correctly resubmit this answer later (e.g. from an offline
   *  draft) without guessing the question's type — see submit_survey_response's
   *  question_type mapping. Optional only because older persisted drafts (from
   *  before this field existed) won't have it. */
  questionType?: QuestionType;
  answer: string | string[] | number | null;
}

export interface OutletSurvey extends ActionStamp {
  id: string;
  outletId: string;
  campaignId: string;
  surveyConfigId?: string;
  surveyName?: string;
  answers: SurveyAnswer[];
  isDraft: boolean;
  timestamp: string;
  /** Why a draft wasn't sent at the last sync (not complete, a photo gone, or the server's refusal), shown on the Drafts and Sync pages. */
  syncError?: string;
}

/** A survey photo whose response already reached the server but whose upload
 *  (upload_survey_photo) didn't — queued and retried from the Sync page. */
export interface PendingSurveyPhoto {
  id: string;
  responseId: string;
  questionId: string;
  /** Local copy in the app's documents folder, deleted once it uploads. */
  photoUri: string;
  surveyName?: string;
  createdAt: string;
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
/** One cart line per product and unit. */
export interface CartLine {
  productId: string;
  productName: string;
  /** The unit `quantity` counts in. Missing on lines saved before units
   *  existed — those are in the product's stock unit. */
  uom?: string;
  /** Stock units in one `uom`; missing means 1 (a pre-units line). */
  conversionFactor?: number;
  /** Price for one `uom` — a preview: the server prices every line itself. */
  unitPrice: number;
  /** Quantity in `uom`. */
  quantity: number;
}

/**
 * What every action the app can send again carries (submit_field_sale,
 * submit_outlet, skip_outlet_visit...): a one-time ID the server answers a
 * repeat of exactly as the first time, when the agent did it, and who did it.
 * Kept on the draft or queued item, unchanged, until it's sent.
 */
export interface ActionStamp {
  /** UUID made when the agent first did it (client_ref). Missing on items saved before it existed. */
  clientRef?: string;
  /** When the agent did it, by the phone's clock: "YYYY-MM-DD HH:MM:SS" (happened_at). */
  happenedAt?: string;
  /** The signed-in agent's email when it was done: only they can send it. */
  agentEmail?: string;
}

export interface Draft extends ActionStamp {
  id: string;
  mode: 'sale' | 'order';
  outletId: string;
  outletName: string;
  customerId?: string;
  customerName?: string;
  /** Which campaign this was created under — needed to submit it correctly if
   *  it's still queued when the agent's active campaign has since changed. */
  campaignId?: string;
  cart: CartLine[];
  /** Entered on the Summary tab; sent with the order when the draft is submitted. */
  promoCode?: string;
  updatedAt: string;
  pendingSync: true;
  /** Submitted with no connection, so it goes up on its own once there's one.
   *  A cart saved to finish later isn't: it goes only from the Sync page. */
  ready?: boolean;
  /** Why the server refused it at the last sync (e.g. not enough stock for a sale), shown on the Drafts and Sync pages. */
  syncError?: string;
  /** A sale's location when it was submitted (and the agent's reason when it was outside), sent when the draft syncs. */
  saleLocation?: SaleLocation;
}

// ─── Lead Draft (offline queue) ──────────────────────────────────────────────
export interface LeadDraft extends ActionStamp {
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
  /** Why the server refused it at the last sync, shown on the Drafts and Sync pages. */
  syncError?: string;
}

// ─── Outlet Draft (offline queue) ────────────────────────────────────────────
export interface OutletDraft extends ActionStamp {
  id: string;
  mode: 'create' | 'edit';
  /** Only set for mode: 'edit' — which existing outlet this update applies to. */
  outletId?: string;
  campaignId: string;
  name: string;
  /** The outlet type's name; on a draft saved before the pickers kept ids, the channel's name. */
  type: string;
  /** The sub-channel's name. */
  subChannel?: string;
  outletTypeId?: string;
  channelId?: string;
  subChannelId?: string;
  distributorId?: string;
  address: string;
  phone?: string;
  ownerName?: string;
  ownerPhone?: string;
  notes?: string;
  photoUri?: string;
  /** Only when the agent captured a new location (Update Location); it goes for approval. */
  latitude?: number;
  longitude?: number;
  /** That location fix's accuracy, in meters. */
  gpsAccuracy?: number;
  /** A new outlet the agent said isn't any of the outlets it looked like (confirmed_new). */
  confirmedNew?: boolean;
  createdAt: string;
  pendingSync: true;
  /** Why the server refused it at the last sync, shown on the Drafts and Sync pages. */
  syncError?: string;
}

// ─── Queued actions (offline queue) ──────────────────────────────────────────
/** A stock request line, in stock units (as submit_stock_request takes it). */
export interface QueuedStockRequestLine {
  itemCode: string;
  itemName?: string;
  qty: number;
  cases?: number;
  units?: number;
}

interface QueuedActionBase extends ActionStamp {
  id: string;
  /** Why the server refused it at the last sync, shown on the Drafts and Sync pages. */
  syncError?: string;
}

/** A skip, stage change or stock request made with no connection, sent when there's one. */
export type QueuedAction =
  | (QueuedActionBase & {
      kind: 'skip';
      outletId: string;
      outletName: string;
      campaignId: string;
      /** What skip_outlet_visit takes: the reason, or the agent's note for "Other". */
      reason: string;
      latitude?: number;
      longitude?: number;
    })
  | (QueuedActionBase & { kind: 'leadStage'; leadId: string; leadName: string; stage: LeadStage; reason: string; notes?: string })
  | (QueuedActionBase & { kind: 'leadRegression'; leadId: string; leadName: string; toStage: LeadStage; reason: string })
  | (QueuedActionBase & { kind: 'stockRequest'; campaignId: string; lines: QueuedStockRequestLine[]; note?: string });

// ─── Morning download / sync status ─────────────────────────────────────────
/** The day's download (outlets, products, surveys...), as it last went. */
export interface DayPackStatus {
  /** Whose data it was. */
  agentEmail?: string;
  /** ISO time each part last downloaded fine, by part. */
  parts: Record<string, string>;
  /** ISO time the whole download last finished with every part in. */
  completedAt?: string;
}

/** Where sending the phone's queue stands. */
export interface SyncStatus {
  /** A sync is running now (never saved). */
  running: boolean;
  /** ISO time the last sync finished with nothing left that it could send. */
  lastSyncedAt?: string;
  /** The last sync stopped on an expired login: the agent has to sign in again. */
  needsSignIn?: boolean;
  /** What the last syncs had to say, e.g. "Sent. Your supervisor will check whether Iya Basira is a duplicate." */
  notices: string[];
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
