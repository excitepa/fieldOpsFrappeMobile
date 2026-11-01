import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { Header } from '../../components/Header';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';
import { ScrollableTabs, TabItem } from '../../components/ScrollableTabs';
import { useFieldStore } from '../../store/useFieldStore';
import { generateInvoiceRef, generateOrderRef } from '../../services/mockService';
import { getItems, getMyGeofence, submitFieldSale, submitSalesOrder, NetworkError, OrderLinePayload, SavedOrderLine } from '../../services/api';
import { blockIfDayLocked } from '../../utils/dayLock';
import { parseGps } from '../../utils/geo';
import { checkSaleLocation } from '../../utils/geofence';
import { freshFix } from '../../utils/locationFix';
import { RouteName, CartLine, Draft, OutletSale, OutletOrder, SaleLocation, ActionStamp } from '../../types';
import { getStockShortfalls, lineFactor, lineStockQty, StockShortfall } from '../../utils/cart';
import { describeShortfalls, withUnsentSales } from '../../utils/stock';
import { previewFreeGoods } from '../../utils/promotions';
import { newClientRef } from '../../utils/queue';
import { localDateTimeStr } from '../../utils/timestamp';
import { mslFirst, missingMslProducts } from '../../utils/msl';
import { useCart } from './useCart';
import { OrderWorkspace } from './OrderWorkspace';
import { SurveyTab } from './tabs/SurveyTab';
import { SummaryTab } from './tabs/SummaryTab';
import { DockedCartBar } from './components/DockedCartBar';
import { OutsideLocationSheet } from './components/OutsideLocationSheet';

interface OutletActivityScreenProps {
  routeData?: {
    outletId?: string;
    initialTab?: string;
    saleCart?: CartLine[];
    orderCart?: CartLine[];
    resumeDraftId?: string;
  };
  onNavigate: (route: RouteName, data?: any) => void;
}

export const OutletActivityScreen: React.FC<OutletActivityScreenProps> = ({ routeData, onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();

  const outletId = routeData?.outletId;
  const outlet = state.outlets.find((o) => o.id === outletId);
  const activeCampaign = state.activeCampaign;

  // This screen is a focused, single-purpose destination — each FAB action
  // ("New Sale", "New Order", "New Merchandising") routes in with an
  // `initialTab` that pins exactly which activity is being logged, matching
  // the reference design's separate screens rather than one combined hub
  // with every campaign module as its own tab.
  const resumeDraft = routeData?.resumeDraftId ? state.drafts.find((d) => d.id === routeData.resumeDraftId) : undefined;
  const initialTab = routeData?.initialTab;
  const merchandisingSurveyConfig = (activeCampaign?.surveys || []).find(
    (s) => s.module === 'merchandising' && `survey:${s.id}` === initialTab
  );

  const category: 'sale' | 'order' | 'merchandising' = merchandisingSurveyConfig
    ? 'merchandising'
    : initialTab === 'order' || resumeDraft?.mode === 'order'
    ? 'order'
    : 'sale';

  // Sale/Order tabs mirror the reference OrderWorkspace exactly: "Sale" (or
  // "Order") for picking products, "Summary" for the cart review + submit —
  // no Stocks/Photo/other-mode tabs mixed in. Merchandising has no tab bar.
  const tabs: TabItem[] =
    category === 'merchandising'
      ? []
      : category === 'sale'
      ? [{ id: 'sale', label: 'Sale' }, { id: 'summary', label: 'Summary' }]
      : [{ id: 'order', label: 'Order' }, { id: 'summary', label: 'Summary' }];

  const [activeTabId, setActiveTabId] = useState<string>(category === 'merchandising' ? 'merchandising' : category);
  const saleCart = useCart(routeData?.saleCart || []);
  const orderCart = useCart(routeData?.orderCart || []);
  const activeCart = category === 'order' ? orderCart : saleCart;
  const [submitting, setSubmitting] = useState(false);
  // A sale away from the outlet or outside the territory: what's wrong (the
  // sheet asking for a reason is open while set), and where it was recorded.
  const [outsideProblems, setOutsideProblems] = useState<string[] | null>(null);
  const pendingLocation = useRef<SaleLocation | undefined>(undefined);
  // Optional, sent with the order; a resumed draft brings back the one it was saved with.
  const [promoCode, setPromoCode] = useState(resumeDraft?.promoCode || '');

  // The outlet itself is the customer for a Sale/Order — there is no separate
  // "choose a customer" step (matches the reference OrderWorkspace, which
  // only shows an empty state when no outlet is resolved at all).
  // The Sale/Order product catalog is scoped to the active campaign's
  // `productIds`, matching the reference (e.g. Silver Card Rollout only
  // sells the ₦250k tier) instead of always listing every product.
  // Stock as the agent can still sell it: less what their unsent sales take
  // (a resumed draft is the cart itself, so it doesn't count against it).
  const stockProducts = withUnsentSales(state.products, state.drafts, routeData?.resumeDraftId);
  const scopedProducts = activeCampaign?.productIds?.length
    ? stockProducts.filter((p) => activeCampaign.productIds!.includes(p.id))
    : stockProducts;
  // get_items returns the FULL company item catalog, not just what this agent
  // actually has on hand — confirmed against a real account whose stock only
  // covered 3 of 8 catalog items. A Sale is sold from the agent's own stock
  // right now, so anything they have zero of isn't a real option and only
  // clutters the list ("products not related to the agent"). An Order is a
  // pre-order for future delivery, so it isn't gated on current stock the
  // same way — that list stays the full scoped catalog.
  // MSL (must-stock-list) products are listed first.
  const campaignProducts = mslFirst(category === 'sale'
    ? scopedProducts.filter((p) => p.stock > 0)
    : scopedProducts);

  // The free goods the cart earns, previewed on the phone (the server adds the
  // real ones on submit). Looked up in the full catalog: a reward item doesn't
  // have to be one of this campaign's products.
  const freeGoods = category === 'merchandising' ? [] : previewFreeGoods(activeCart.cart, state.products).lines;
  // A sale also needs stock for its free goods.
  const stockShortfalls = category === 'sale' ? getStockShortfalls(activeCart.cart, stockProducts, freeGoods) : [];

  // Hydrate a saved draft on first mount, if resuming one.
  useEffect(() => {
    if (routeData?.resumeDraftId) {
      const draft = state.drafts.find((d) => d.id === routeData.resumeDraftId);
      if (draft) {
        if (draft.mode === 'sale') saleCart.setCart(draft.cart);
        else orderCart.setCart(draft.cart);
        setActiveTabId(draft.mode);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Create order instead" opens this screen again with the sale's cart as an
  // order. The screen stays mounted when it navigates to itself, so useCart's
  // starting cart is long gone: the new cart and tab are picked up here.
  useEffect(() => {
    if (initialTab === 'order' && routeData?.orderCart?.length) {
      orderCart.setCart(routeData.orderCart);
      setActiveTabId('order');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeData?.orderCart]);

  // Refresh the product catalog (price/stock) from the backend each time a sale/order
  // is started, same fetch-on-mount pattern used by Outlets/Leads.
  useEffect(() => {
    // Always reflects exactly what the server just said, including a real
    // empty catalog — never leaves a previous (possibly stale, possibly
    // another agent's) product list sitting there looking current. Left
    // untouched only on an outright failed request (no response to trust).
    getItems()
      .then((fetched) => {
        dispatch({ type: 'SET_PRODUCTS', products: fetched });
      })
      .catch(() => {});
    // The agent's territory and the GPS tolerance, for the sale's location
    // check; the copy kept on the device is used when this fails.
    getMyGeofence()
      .then((geofence) => dispatch({ type: 'SET_GEOFENCE', geofence }))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!outlet) {
    return (
      <SafeAreaView style={styles.container}>
        <Header title="Outlet Activity" subtitle="Outlet missing" onNavigate={onNavigate} onBackPress={() => onNavigate('outlets')} />
        <View style={styles.missingContainer}>
          <Icon name="alert-circle" size={44} color={theme.colors.amber} />
          <Text style={styles.missingTitle}>This activity needs an outlet.</Text>
          <Button title="Go to Outlets List" onPress={() => onNavigate('outlets')} variant="primary" />
        </View>
      </SafeAreaView>
    );
  }

  // What a sale or order is sent with (see ActionStamp): a resumed draft's
  // one-time ID, so the server knows it if an earlier send of it got through,
  // else a new one. A sale turned into an order gets a new one: they're the
  // same kind of record on the server, so the sale's ID would bring the sale back.
  const stampFor = (mode: 'sale' | 'order'): ActionStamp => {
    const resumed = resumeDraft && resumeDraft.mode === mode ? resumeDraft : undefined;
    return {
      clientRef: resumed?.clientRef || newClientRef(),
      happenedAt: localDateTimeStr(),
      agentEmail: resumed?.agentEmail || state.user.email?.trim().toLowerCase() || undefined,
    };
  };

  // `ready`: submitted with no connection, so it goes up on its own once
  // there's one; a cart saved to finish later doesn't.
  const buildDraft = (mode: 'sale' | 'order', cart: CartLine[], saleLocation?: SaleLocation, stamp: ActionStamp = stampFor(mode), ready = false): Draft => ({
    ...stamp,
    ready,
    id: routeData?.resumeDraftId && category === mode ? routeData.resumeDraftId : `draft-${mode}-${outlet.id}-${Date.now()}`,
    mode,
    outletId: outlet.id,
    outletName: outlet.name,
    customerId: outlet.id,
    customerName: outlet.name,
    campaignId: activeCampaign?.id,
    cart,
    promoCode: mode === category ? promoCode.trim() || undefined : undefined,
    updatedAt: new Date().toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }),
    pendingSync: true,
    // Where a sale was submitted from, when it was (the check ran then).
    saleLocation: mode === 'sale' ? saleLocation : undefined,
  });

  // Fresh stock from the server, kept for the whole app. An empty list is
  // taken as a failed load (get_items answers [] when it fails), not as
  // every product gone.
  const refreshProducts = async () => {
    const fetched = await getItems();
    if (fetched.length === 0) throw new Error('No products came back.');
    dispatch({ type: 'SET_PRODUCTS', products: fetched });
    return fetched;
  };

  // A sale is checked against stock refreshed from the server; when that
  // can't be loaded, against the stock on this device. Either way less what
  // unsent sales take, so a sale offline can't sell stock another one has.
  const checkSaleStock = async (): Promise<StockShortfall[]> => {
    let products = state.products;
    try {
      products = await refreshProducts();
    } catch {
      // Offline or failing: the stock on this device.
    }
    const sellable = withUnsentSales(products, state.drafts, routeData?.resumeDraftId);
    return getStockShortfalls(saleCart.cart, sellable, previewFreeGoods(saleCart.cart, products).lines);
  };

  // The sale's cart as an order: a pre-order doesn't need the agent's stock.
  // A resumed sale draft goes with it, so it becomes the order's draft.
  const createOrderInstead = () => {
    const cart = saleCart.cart;
    saleCart.clear();
    onNavigate('outletActivity', { outletId: outlet.id, initialTab: 'order', orderCart: cart, resumeDraftId: routeData?.resumeDraftId });
  };

  const offerOrderInstead = (message: string) => {
    Alert.alert('Not Enough Stock', message, [
      { text: 'Edit sale', style: 'cancel' },
      { text: 'Create order instead', onPress: createOrderInstead },
    ]);
  };

  // A sale saved for later is checked against the stock on this device:
  // short now means it may be refused when it syncs.
  const draftStockWarning = (mode: 'sale' | 'order', cart: CartLine[]): string => {
    if (mode !== 'sale') return '';
    const short = getStockShortfalls(cart, stockProducts, previewFreeGoods(cart, state.products).lines);
    return short.length > 0
      ? `The stock on this device doesn't cover this sale:\n${describeShortfalls(short)}\n\nIt may be refused when it syncs. An order doesn't need stock.`
      : '';
  };

  const handleBack = () => {
    const dirtyModes: ('sale' | 'order')[] = [];
    if (saleCart.cart.length > 0) dirtyModes.push('sale');
    if (orderCart.cart.length > 0) dirtyModes.push('order');

    if (dirtyModes.length === 0) {
      onNavigate('outletDetail', { outletId: outlet.id });
      return;
    }

    Alert.alert(
      'Unsaved Cart',
      `You have items in your ${dirtyModes.join(' and ')} cart. Save as a draft before leaving?`,
      [
        { text: 'Discard', style: 'destructive', onPress: () => onNavigate('outletDetail', { outletId: outlet.id }) },
        {
          text: 'Save Draft',
          onPress: () => {
            dirtyModes.forEach((mode) => {
              const cart = mode === 'sale' ? saleCart.cart : orderCart.cart;
              dispatch({ type: 'SAVE_DRAFT', draft: buildDraft(mode, cart) });
            });
            const warning = dirtyModes.includes('sale') ? draftStockWarning('sale', saleCart.cart) : '';
            if (warning) Alert.alert('Draft Saved', warning);
            onNavigate('outletDetail', { outletId: outlet.id });
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleSaveDraft = () => {
    const mode = category as 'sale' | 'order';
    dispatch({ type: 'SAVE_DRAFT', draft: buildDraft(mode, activeCart.cart) });
    const warning = draftStockWarning(mode, activeCart.cart);
    if (warning) Alert.alert('Draft Saved', warning);
    onNavigate('draftsList');
  };

  // Before submitting: a sale's stock, checked again against the server's
  // figures, and where it's being recorded; then a reminder of the MSL
  // products the cart lacks — from the list the agent picks from, so for a
  // sale only ones in stock. Neither the location nor the MSL reminder blocks
  // the submission. An order isn't stock- or location-checked.
  const handleSubmit = async () => {
    if (blockIfDayLocked(state.dayLockedUntil)) return;
    if (activeCart.cart.length === 0) return;
    let location: SaleLocation | undefined;
    if (category === 'sale') {
      setSubmitting(true);
      const short = await checkSaleStock();
      if (short.length > 0) {
        setSubmitting(false);
        offerOrderInstead(`${describeShortfalls(short)}\n\nCreate an order instead, or reduce the quantities.`);
        return;
      }
      // A fresh fix, checked against the outlet's saved location and the
      // agent's territory (offline too: both are kept on the device). Away,
      // outside or without a fix, the agent says why before it's recorded.
      const fix = await freshFix();
      setSubmitting(false);
      location = fix ? { lat: fix.lat, lng: fix.lng, accuracy: fix.accuracy, capturedAt: fix.capturedAt } : {};
      const check = checkSaleLocation(fix, { name: outlet.name, coords: parseGps(outlet.gps) }, state.geofence);
      if (check.problems.length > 0) {
        pendingLocation.current = location;
        setOutsideProblems(check.problems);
        return;
      }
    }
    confirmMslThenCheckout(location);
  };

  const handleOutsideConfirm = (reason: string) => {
    const location: SaleLocation = { ...pendingLocation.current, outsideReason: reason };
    setOutsideProblems(null);
    confirmMslThenCheckout(location);
  };

  const confirmMslThenCheckout = (location?: SaleLocation) => {
    const missing = missingMslProducts(activeCart.cart, campaignProducts);
    if (missing.length === 0) {
      handleCheckout(location);
      return;
    }
    Alert.alert(
      'MSL Products Missing',
      `This ${category} doesn't include ${missing.length === 1 ? 'this must-stock product' : 'these must-stock products'}:\n\n${missing.map((p) => `• ${p.name}`).join('\n')}`,
      [
        { text: 'Add items', style: 'cancel', onPress: () => setActiveTabId(category) },
        { text: 'Submit anyway', onPress: () => { handleCheckout(location); } },
      ]
    );
  };

  const handleCheckout = async (location?: SaleLocation) => {
    if (blockIfDayLocked(state.dayLockedUntil)) return;
    const mode = category as 'sale' | 'order';
    if (activeCart.cart.length === 0) return;

    setSubmitting(true);
    const nowStr = new Date().toLocaleString('en-US', {
      month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });
    // Taken before the first request and kept on the draft if it fails, so a
    // sale the server saved before the answer was lost isn't saved twice.
    const stamp = stampFor(mode);
    const meta = { clientRef: stamp.clientRef, happenedAt: stamp.happenedAt };

    // Each line goes in its own unit; a line from a draft saved before units has
    // no uom, which the server reads as the stock unit.
    const lines: OrderLinePayload[] = activeCart.cart.map((line) => ({
      itemCode: line.productId,
      itemName: line.productName,
      qty: line.quantity,
      uom: line.uom,
      rate: line.unitPrice,
    }));

    let ref: string;
    // The lines as the server saved them (free goods included) — undefined from
    // a backend that doesn't return them, where the cart is all there is.
    let savedLines: SavedOrderLine[] | undefined;
    try {
      if (mode === 'sale') {
        // With where it was recorded (taken before submitting, see
        // handleSubmit): the server checks it again and flags it.
        const result = await submitFieldSale(outlet.id, activeCampaign?.id || '', lines, activeCart.total, location, promoCode, meta);
        ref = result.ref || generateInvoiceRef();
        savedLines = result.items;
      } else {
        const result = await submitSalesOrder(outlet.id, activeCampaign?.id || '', lines, promoCode, meta);
        ref = result.ref || generateOrderRef();
        savedLines = result.items;
      }
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        // Genuine connectivity failure, not a rejection — auto-save the cart as
        // a real draft (same record a manual "Save Draft" would create) instead
        // of just losing it, so it can be pushed for real from the Sync page
        // once back online.
        dispatch({ type: 'SAVE_DRAFT', draft: buildDraft(mode, activeCart.cart, location, stamp, true) });
        // The visit happened: the outlet shows as visited before it's sent.
        dispatch({ type: 'MARK_OUTLET_VISITED', outletId: outlet.id });
        const warning = draftStockWarning(mode, activeCart.cart);
        Alert.alert(
          'Saved Locally',
          `No connection, so this ${mode} is saved on this phone. It's sent automatically once you're back online.${warning ? `\n\n${warning}` : ''}`,
        );
        onNavigate('outletDetail', { outletId: outlet.id });
      } else if (mode === 'sale' && e?.code === 'INSUFFICIENT_STOCK') {
        // The server's stock doesn't cover it (free goods included). Its
        // message names the products and what's available; the cart stays,
        // and the stock shown is brought up to date.
        refreshProducts().catch(() => {});
        offerOrderInstead(e.message || 'There isn\'t enough stock for this sale.');
      } else {
        // The request reached the server and was rejected — this will never
        // succeed on retry, so don't disguise it as an offline save.
        Alert.alert(
          `Could Not Submit ${mode === 'sale' ? 'Sale' : 'Order'}`,
          e?.message || 'The server rejected this transaction. Please check the details and try again.'
        );
      }
      return;
    }

    // The local records — and so the receipt / order confirmation — are the
    // lines the server saved: priced by it, free goods included, adding up to
    // its total. A backend that doesn't return them leaves the cart as the record.
    const recorded: SavedOrderLine[] = savedLines || activeCart.cart.map((line) => ({
      itemCode: line.productId,
      itemName: line.productName,
      uom: line.uom,
      qty: line.quantity,
      conversionFactor: lineFactor(line),
      stockQty: lineStockQty(line),
      rate: line.unitPrice,
      amount: line.unitPrice * line.quantity,
      isFree: false,
    }));
    const records = recorded.map((line, idx) => ({
      id: `${mode}-${Date.now()}-${idx}`,
      outletId: outlet.id,
      campaignId: activeCampaign?.id || 'c2',
      productId: line.itemCode,
      productName: line.itemName,
      quantity: line.qty,
      uom: line.uom,
      conversionFactor: line.conversionFactor,
      stockQty: line.stockQty,
      unitPrice: line.rate,
      total: line.amount,
      isFree: line.isFree || undefined,
      promotionName: line.promotionName,
      customerId: outlet.id,
      customerName: outlet.name,
      timestamp: nowStr,
    }));
    // ADD_SALE/ADD_ORDER prepend, so the last line goes in first to keep the server's order.
    [...records].reverse().forEach((record) => {
      if (mode === 'sale') {
        const sale: OutletSale = { ...record, invoiceRef: ref };
        dispatch({ type: 'ADD_SALE', sale });
        // Local stock comes down by every saved line, paid and free, in stock
        // units — free goods leave the agent's stock too.
        if (record.stockQty > 0) {
          dispatch({ type: 'DECREMENT_STOCK', productId: record.productId, qty: record.stockQty, outletId: outlet.id });
        }
      } else {
        const order: OutletOrder = { ...record, status: 'Pending', orderRef: ref };
        dispatch({ type: 'ADD_ORDER', order });
      }
    });

    dispatch({ type: 'MARK_OUTLET_VISITED', outletId: outlet.id });
    if (routeData?.resumeDraftId) dispatch({ type: 'DELETE_DRAFT', draftId: routeData.resumeDraftId });

    // Reconcile local stock with the server's real post-sale/post-order figure.
    // The optimistic DECREMENT_STOCK above has its own safety net that silently
    // skips the decrement if local stock looked stale/insufficient — this
    // refetch is what actually guarantees the UI shows the true number instead
    // of quietly sitting on a pre-sale value until something else happens to
    // refetch products.
    getItems().then((fetched) => {
      dispatch({ type: 'SET_PRODUCTS', products: fetched });
    }).catch(() => {});

    activeCart.clear();
    setPromoCode('');
    setSubmitting(false);

    if (mode === 'sale') {
      onNavigate('saleReceipt', { outletId: outlet.id, invoiceRef: ref });
    } else {
      onNavigate('orderSuccess', { outletId: outlet.id, orderRef: ref });
    }
  };

  // Header reflects whichever activity is active, matching each reference
  // screen's own title ("New Sale", "New Order", "Merchandising").
  const headerTitle =
    category === 'sale' ? 'New Sale'
    : category === 'order' ? 'New Order'
    : merchandisingSurveyConfig?.name || 'Merchandising';

  return (
    <SafeAreaView style={styles.container}>
      <Header title={headerTitle} subtitle={outlet.name} onNavigate={onNavigate} onBackPress={handleBack} />
      {tabs.length > 0 && <ScrollableTabs tabs={tabs} activeId={activeTabId} onSelect={setActiveTabId} />}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {activeTabId === 'sale' && (
          <OrderWorkspace mode="sale" products={campaignProducts} cart={saleCart.cart} onSetQty={saleCart.setQty} />
        )}
        {activeTabId === 'order' && (
          <OrderWorkspace mode="order" products={campaignProducts} cart={orderCart.cart} onSetQty={orderCart.setQty} />
        )}
        {merchandisingSurveyConfig && (
          <SurveyTab
            outletId={outlet.id}
            campaignId={activeCampaign?.id || 'c2'}
            surveyConfig={merchandisingSurveyConfig}
            onSubmitted={() => onNavigate('outletDetail', { outletId: outlet.id })}
          />
        )}
        {activeTabId === 'summary' && category !== 'merchandising' && (
          <SummaryTab
            mode={category}
            customerName={outlet.name}
            cart={activeCart.cart}
            products={campaignProducts}
            total={activeCart.total}
            stockShortfalls={stockShortfalls}
            freeGoods={freeGoods}
            promoCode={promoCode}
            onPromoCodeChange={setPromoCode}
            submitting={submitting}
            onDeleteLine={activeCart.remove}
            onEdit={() => setActiveTabId(category)}
            onSaveDraft={handleSaveDraft}
            onSubmit={handleSubmit}
          />
        )}
      </ScrollView>

      {activeTabId !== 'summary' && category !== 'merchandising' && activeCart.cart.length > 0 && (
        <DockedCartBar
          mode={category}
          itemCount={activeCart.cart.length}
          total={activeCart.total}
          onPress={() => setActiveTabId('summary')}
        />
      )}

      <OutsideLocationSheet
        visible={!!outsideProblems}
        problems={outsideProblems || []}
        onConfirm={handleOutsideConfirm}
        onCancel={() => setOutsideProblems(null)}
      />
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 120 },
  missingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  missingTitle: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.textDark, textAlign: 'center' },
});
