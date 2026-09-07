import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { Header } from '../../components/Header';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';
import { ScrollableTabs, TabItem } from '../../components/ScrollableTabs';
import { useFieldStore } from '../../store/useFieldStore';
import { generateInvoiceRef, generateOrderRef } from '../../services/mockService';
import { getItems, submitFieldSale, submitSalesOrder, NetworkError, OrderLinePayload } from '../../services/api';
import { RouteName, CartLine, Draft, OutletSale, OutletOrder } from '../../types';
import { getStockShortfalls } from '../../utils/cart';
import { useCart } from './useCart';
import { OrderWorkspace } from './OrderWorkspace';
import { SurveyTab } from './tabs/SurveyTab';
import { SummaryTab } from './tabs/SummaryTab';
import { DockedCartBar } from './components/DockedCartBar';

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

  // The outlet itself is the customer for a Sale/Order — there is no separate
  // "choose a customer" step (matches the reference OrderWorkspace, which
  // only shows an empty state when no outlet is resolved at all).
  // The Sale/Order product catalog is scoped to the active campaign's
  // `productIds`, matching the reference (e.g. Silver Card Rollout only
  // sells the ₦250k tier) instead of always listing every product.
  const campaignProducts = activeCampaign?.productIds?.length
    ? state.products.filter((p) => activeCampaign.productIds!.includes(p.id))
    : state.products;

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

  // Refresh the product catalog (price/stock) from the backend each time a sale/order
  // is started, same fetch-on-mount pattern used by Outlets/Leads.
  useEffect(() => {
    getItems()
      .then((fetched) => {
        if (fetched.length > 0) dispatch({ type: 'SET_PRODUCTS', products: fetched });
      })
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

  const buildDraft = (mode: 'sale' | 'order', cart: CartLine[]): Draft => ({
    id: routeData?.resumeDraftId && category === mode ? routeData.resumeDraftId : `draft-${mode}-${outlet.id}-${Date.now()}`,
    mode,
    outletId: outlet.id,
    outletName: outlet.name,
    customerId: outlet.id,
    customerName: outlet.name,
    cart,
    updatedAt: new Date().toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }),
    pendingSync: true,
  });

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
    onNavigate('draftsList');
  };

  const handleCheckout = async () => {
    const mode = category as 'sale' | 'order';
    if (activeCart.cart.length === 0) return;

    if (mode === 'sale') {
      const shortfalls = getStockShortfalls(activeCart.cart, state.products);
      if (shortfalls.length > 0) return;
    }

    setSubmitting(true);
    const nowStr = new Date().toLocaleString('en-US', {
      month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });

    const lines: OrderLinePayload[] = activeCart.cart.map((line) => ({
      itemCode: line.productId,
      qty: line.quantity,
      rate: line.unitPrice,
    }));

    let ref: string;
    try {
      if (mode === 'sale') {
        const result = await submitFieldSale(outlet.id, activeCampaign?.id || '', lines, activeCart.total);
        ref = result.ref || generateInvoiceRef();
      } else {
        const result = await submitSalesOrder(outlet.id, activeCampaign?.id || '', lines);
        ref = result.ref || generateOrderRef();
      }
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('No Connection', 'Could not reach the server. Check your connection and try again.');
      } else {
        Alert.alert(
          `Could Not Submit ${mode === 'sale' ? 'Sale' : 'Order'}`,
          e?.message || 'The server rejected this transaction. Please check the details and try again.'
        );
      }
      return;
    }

    activeCart.cart.forEach((line) => {
      if (mode === 'sale') {
        const sale: OutletSale = {
          id: `sale-${Date.now()}-${line.productId}`,
          outletId: outlet.id,
          campaignId: activeCampaign?.id || 'c2',
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          total: line.unitPrice * line.quantity - line.discount,
          customerId: outlet.id,
          customerName: outlet.name,
          promoLabel: line.promoLabel,
          timestamp: nowStr,
          invoiceRef: ref,
        };
        dispatch({ type: 'ADD_SALE', sale });
        dispatch({ type: 'DECREMENT_STOCK', productId: line.productId, qty: line.quantity, outletId: outlet.id });
      } else {
        const order: OutletOrder = {
          id: `order-${Date.now()}-${line.productId}`,
          outletId: outlet.id,
          campaignId: activeCampaign?.id || 'c2',
          productId: line.productId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discount: line.discount,
          total: line.unitPrice * line.quantity - line.discount,
          customerId: outlet.id,
          customerName: outlet.name,
          status: 'Pending',
          timestamp: nowStr,
          orderRef: ref,
        };
        dispatch({ type: 'ADD_ORDER', order });
      }
    });

    dispatch({ type: 'MARK_OUTLET_VISITED', outletId: outlet.id });
    if (routeData?.resumeDraftId) dispatch({ type: 'DELETE_DRAFT', draftId: routeData.resumeDraftId });

    activeCart.clear();
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
            stockShortfalls={category === 'sale' ? getStockShortfalls(activeCart.cart, state.products) : []}
            submitting={submitting}
            onDeleteLine={activeCart.remove}
            onEdit={() => setActiveTabId(category)}
            onSaveDraft={handleSaveDraft}
            onSubmit={handleCheckout}
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
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  scroll: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 120 },
  missingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md, padding: theme.spacing.xl },
  missingTitle: { fontFamily: theme.fonts.bold, fontSize: 18, color: theme.colors.textDark, textAlign: 'center' },
});
