import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { Header } from '../components/Header';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { useFieldStore } from '../store/useFieldStore';
import { getItems, getMyInventory, submitStockRequest, getMyStockRequests, StockRequestSummary, NetworkError } from '../services/api';
import { mslFirst } from '../utils/msl';
import { getSellingUnits, getStockUnit } from '../utils/cart';
import { formatQty, formatUnitQty, unitWord } from '../utils/units';
import { formatStockBreakdown } from '../utils/stock';
import { formatServerDateTime } from '../utils/timestamp';
import { buildBasketLine, toStockRequestLine } from '../utils/stockRequest';
import { blockIfDayLocked } from '../utils/dayLock';
import { newStamp } from '../utils/queue';
import { RouteName, Product, ActionStamp } from '../types';

interface InventoryScreenProps {
  onNavigate: (route: RouteName, data?: any) => void;
}

type MainTab = 'request' | 'stock' | 'requests';
type StockView = 'list' | 'basket' | 'review';
/** How many of each unit (by uom) of one product are in the basket. */
type BasketQty = Record<string, number>;

export const InventoryScreen: React.FC<InventoryScreenProps> = ({ onNavigate }) => {
  const theme = useTheme();
  const styles = createStyles(theme);
  const { state, dispatch } = useFieldStore();
  const products = state.products;

  const [mainTab, setMainTab] = useState<MainTab>('request');
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [quantities, setQuantities] = useState<Record<string, BasketQty>>({});
  const [view, setView] = useState<StockView>('list');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // The basket's one-time ID and when it was sent, from its first Submit: a
  // second Submit after one that got no answer is the same request.
  const requestStampRef = useRef<ActionStamp | null>(null);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [inventoryError, setInventoryError] = useState('');
  const [stockRequests, setStockRequests] = useState<StockRequestSummary[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestsError, setRequestsError] = useState('');
  const [myInventory, setMyInventory] = useState<Product[]>([]);
  const [loadingMyStock, setLoadingMyStock] = useState(false);
  const [myStockError, setMyStockError] = useState('');

  const fetchInventory = useCallback(async () => {
    setLoadingInventory(true);
    setInventoryError('');
    try {
      // get_items is the full catalog (including zero-stock items), which is what
      // Request Stock needs on purpose — you request what you don't have. It does
      // NOT reflect approved stock request transfers though (confirmed live: after
      // two stock requests for ITC002 were approved, get_items still showed 0 for
      // it) — that's what get_my_inventory (fetched separately below) is for.
      const fetched = await getItems();
      // Always reflects exactly what the server just said — including a real
      // empty result — never leaves a previous (possibly stale, possibly
      // another agent's) list sitting there looking current.
      dispatch({ type: 'SET_PRODUCTS', products: fetched });
      if (fetched.length === 0) {
        setInventoryError('No products are currently allocated to your account.');
      }
    } catch (e: any) {
      setInventoryError(e?.message || 'Could not load your inventory.');
    } finally {
      setLoadingInventory(false);
    }
  }, [dispatch]);

  const fetchMyInventory = useCallback(async () => {
    setLoadingMyStock(true);
    setMyStockError('');
    try {
      // get_my_inventory is what actually reflects an approved stock request transfer
      // (confirmed live: after two ITC002 requests were approved, this correctly
      // returned quantity 2 for it, while get_items stayed at 0) — so "My Stock",
      // meaning what the agent is holding right now, has to read from here and not
      // from the shared get_items-backed product catalog used by Request Stock.
      const fetched = await getMyInventory();
      // No stock isn't a load failure: the list's own empty message says so,
      // and the red row is kept for a load that failed.
      setMyInventory(fetched);
    } catch (e: any) {
      setMyStockError(e?.message || 'Could not load your stock.');
    } finally {
      setLoadingMyStock(false);
    }
  }, []);

  const fetchStockRequests = useCallback(async () => {
    setLoadingRequests(true);
    setRequestsError('');
    try {
      const fetched = await getMyStockRequests();
      setStockRequests(fetched);
    } catch (e: any) {
      setRequestsError(e?.message || 'Could not load your stock requests.');
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => { fetchInventory(); }, [fetchInventory]);
  useEffect(() => {
    if (mainTab === 'requests') fetchStockRequests();
    // Refetched on every visit to My Stock (not just on mount) so a request that
    // was approved after this screen was first opened shows up without the agent
    // having to leave and come back.
    if (mainTab === 'stock') fetchMyInventory();
  }, [mainTab, fetchStockRequests, fetchMyInventory]);

  const categories = ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean) as string[]))];

  // MSL (must-stock-list) products first.
  const filteredProducts = mslFirst(products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = category === 'All' || p.category === category;
    return matchesSearch && matchesCategory;
  }));

  const setUnitQty = (productId: string, uom: string, qty: number) => {
    setQuantities((prev) => ({ ...prev, [productId]: { ...(prev[productId] || {}), [uom]: Math.max(0, qty) } }));
  };

  // A basket line is a product, how many of each of its units (cartons, packs,
  // loose units — as set up in Product Management), and the total in stock
  // units, which is what the request is approved and stocked in.
  const basketLines = Object.entries(quantities)
    .map(([productId, q]) => {
      const product = products.find((p) => p.id === productId);
      return product ? buildBasketLine(product, q) : null;
    })
    .filter((l): l is NonNullable<typeof l> => !!l);

  const basketTotalUnits = basketLines.reduce((sum, l) => sum + l.totalUnits, 0);

  const removeBasketLine = (productId: string) => {
    setQuantities((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const handleSubmitRequest = async () => {
    if (blockIfDayLocked(state.dayLockedUntil)) return;
    if (basketLines.length === 0) return;
    setSubmitting(true);
    const stamp = requestStampRef.current || (requestStampRef.current = newStamp(state.user.email));
    try {
      await submitStockRequest(
        state.activeCampaign?.id || '',
        basketLines.map(toStockRequestLine),
        note.trim() || undefined,
        { clientRef: stamp.clientRef, happenedAt: stamp.happenedAt }
      );
    } catch (e: any) {
      setSubmitting(false);
      if (e instanceof NetworkError) {
        Alert.alert('No Connection', 'Could not reach the server. Check your connection and try again.');
      } else {
        Alert.alert('Could Not Submit Request', e?.message || 'The server rejected this request. Please try again.');
      }
      return;
    }

    setSubmitting(false);
    requestStampRef.current = null;
    setQuantities({});
    setNote('');
    setView('list');
    setMainTab('request');
    fetchStockRequests();
    Alert.alert('Request Submitted', 'Your stock request has been sent for approval.');
  };

  // "My Stock" means what the agent is actually holding right now — sourced from
  // get_my_inventory (see fetchMyInventory above), not the get_items-backed
  // `products` catalog Request Stock uses, since only get_my_inventory reflects
  // an approved stock request transfer.
  const myStockProducts = myInventory.filter((p) => p.stock > 0);
  // The server marks low stock per item ("Low Stock"); a minimum, if one is sent, counts too.
  const lowStockItems = myStockProducts.filter((p) => p.stockStatus === 'Low Stock' || (p.minStock !== undefined && p.stock < p.minStock));

  const headerProps = (() => {
    if (view === 'basket') {
      return { title: `Basket · ${basketLines.length} item${basketLines.length === 1 ? '' : 's'}`, subtitle: undefined, onBackPress: () => setView('list') };
    }
    if (view === 'review') {
      return { title: 'Request summary', subtitle: undefined, onBackPress: () => setView('basket') };
    }
    return {
      title: 'Stock Request',
      subtitle: mainTab === 'request'
        ? 'Request more stock to sell in the field'
        : mainTab === 'stock'
          ? `${myStockProducts.length} products · ${lowStockItems.length} low stock`
          : `${stockRequests.length} request${stockRequests.length === 1 ? '' : 's'} submitted`,
      onBackPress: undefined,
    };
  })();

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title={headerProps.title}
        subtitle={headerProps.subtitle}
        onNavigate={onNavigate}
        onBackPress={headerProps.onBackPress}
      />

      {(mainTab === 'stock' ? loadingMyStock : loadingInventory) && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={theme.colors.navy} />
          <Text style={styles.loadingText}>{mainTab === 'stock' ? 'Loading your stock…' : 'Loading your inventory…'}</Text>
        </View>
      )}
      {mainTab === 'stock'
        ? (!loadingMyStock && myStockError !== '' && (
            <View style={styles.errorRow}>
              <Icon name="alert-circle" size={14} color={theme.colors.red} />
              <Text style={styles.errorText}>{myStockError}</Text>
            </View>
          ))
        : (!loadingInventory && inventoryError !== '' && (
            <View style={styles.errorRow}>
              <Icon name="alert-circle" size={14} color={theme.colors.red} />
              <Text style={styles.errorText}>{inventoryError}</Text>
            </View>
          ))}

      {view === 'list' && (
        <View style={styles.segmentWrapper}>
          <Pressable onPress={() => setMainTab('request')} style={[styles.segment, mainTab === 'request' && styles.segmentActive]}>
            <Text style={[styles.segmentText, mainTab === 'request' && styles.segmentTextActive]}>Request Stock</Text>
          </Pressable>
          <Pressable onPress={() => setMainTab('stock')} style={[styles.segment, mainTab === 'stock' && styles.segmentActive]}>
            <Text style={[styles.segmentText, mainTab === 'stock' && styles.segmentTextActive]}>My Stock</Text>
          </Pressable>
          <Pressable onPress={() => setMainTab('requests')} style={[styles.segment, mainTab === 'requests' && styles.segmentActive]}>
            <Text style={[styles.segmentText, mainTab === 'requests' && styles.segmentTextActive]}>My Requests</Text>
          </Pressable>
        </View>
      )}

      {/* ── Request Stock ─────────────────────────────────────────── */}
      {view === 'list' && mainTab === 'request' && (
        <>
          <ScrollView style={styles.flex1} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.searchBox}>
              <Icon name="search" size={16} color={theme.colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search product name..."
                placeholderTextColor={theme.colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            <View style={styles.categoryRow}>
              {categories.map((c) => {
                const active = c === category;
                return (
                  <Pressable key={c} onPress={() => setCategory(c)} style={[styles.categoryChip, active && styles.categoryChipActive]}>
                    <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>

            {filteredProducts.map((p) => {
              const q = quantities[p.id] || {};
              const units = getSellingUnits(p);
              const stockUnit = getStockUnit(p);
              const totalUnits = units.reduce((sum, u) => sum + (q[u.uom] || 0) * u.conversionFactor, 0);
              const onHandBreakdown = formatStockBreakdown(p.stock, p);
              const details = [p.brand, p.size].filter(Boolean).join(' · ');
              return (
                <View key={p.id} style={styles.productRow}>
                  <View style={styles.productTopRow}>
                    <View style={styles.productIcon}>
                      {p.imageUrl ? (
                        <Image source={{ uri: p.imageUrl }} style={styles.productImage} resizeMode="cover" />
                      ) : (
                        <Icon name="package" size={18} color={theme.colors.navy} />
                      )}
                    </View>
                    <View style={styles.flex1}>
                      {p.isMsl && (
                        <View style={styles.focusBadge}>
                          <Text style={styles.focusBadgeText}>MSL</Text>
                        </View>
                      )}
                      <Text style={styles.productName}>{p.name}</Text>
                      {details ? <Text style={styles.productMeta}>{details}</Text> : null}
                      <Text style={styles.productMeta}>
                        {formatUnitQty(p.stock, stockUnit.uom)} on hand{onHandBreakdown ? ` (${onHandBreakdown})` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* One stepper per unit the product comes in (as set up in
                      Product Management), largest-selling unit first. The request
                      itself is sent in stock units. */}
                  <View style={styles.unitList}>
                    {units.map((u) => {
                      const value = q[u.uom] || 0;
                      const size = u.conversionFactor !== 1 ? ` · ${formatQty(u.conversionFactor)} ${unitWord(stockUnit.uom, u.conversionFactor)}` : '';
                      return (
                        <View key={u.uom} style={styles.unitRow}>
                          <Text style={styles.unitRowLabel} numberOfLines={1}>{u.uom.toUpperCase()}{size}</Text>
                          <View style={styles.unitStepper}>
                            <Pressable onPress={() => setUnitQty(p.id, u.uom, value - 1)} disabled={value <= 0} style={[styles.stepperBtn, value <= 0 && styles.stepperBtnDisabled]}>
                              <Icon name="minus" size={16} color={theme.colors.textDark} />
                            </Pressable>
                            <Text style={styles.stepperValue}>{value}</Text>
                            <Pressable onPress={() => setUnitQty(p.id, u.uom, value + 1)} style={styles.stepperBtn}>
                              <Icon name="plus" size={16} color={theme.colors.textDark} />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {totalUnits > 0 && (
                    <Text style={styles.addedText}>{formatUnitQty(totalUnits, stockUnit.uom)} added to basket</Text>
                  )}
                </View>
              );
            })}
            {filteredProducts.length === 0 && (
              <Text style={styles.emptyText}>No products match your search.</Text>
            )}
          </ScrollView>

          {basketLines.length > 0 && (
            <Pressable onPress={() => setView('basket')} style={styles.basketBar}>
              <View style={styles.basketIconBox}>
                <Icon name="shopping-bag" size={18} color="#FFFFFF" />
                <View style={styles.basketBadge}>
                  <Text style={styles.basketBadgeText}>{basketLines.length}</Text>
                </View>
              </View>
              <View style={styles.flex1}>
                <Text style={styles.basketBarLabel}>BASKET</Text>
                <Text style={styles.basketBarMeta}>{basketLines.length} line{basketLines.length === 1 ? '' : 's'} · {basketTotalUnits} units</Text>
              </View>
              <View style={styles.basketReviewBtn}>
                <Text style={styles.basketReviewBtnText}>Review</Text>
              </View>
            </Pressable>
          )}
        </>
      )}

      {/* ── My Stock ─────────────────────────────────────────────── */}
      {view === 'list' && mainTab === 'stock' && (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {lowStockItems.length > 0 && (
            <View style={styles.lowStockBanner}>
              <Icon name="alert-circle" size={16} color={theme.colors.amber} />
              <Text style={styles.lowStockBannerText}>
                {lowStockItems.map((p) => p.name).join(', ')} running low — request more soon.
              </Text>
            </View>
          )}
          {myStockProducts.length === 0 && !loadingMyStock && !myStockError && (
            <Text style={styles.emptyStockText}>You don't have any stock in hand right now — request some from the Request Stock tab.</Text>
          )}
          {myStockProducts.map((p, idx) => {
            const stockUnit = getStockUnit(p);
            const breakdown = formatStockBreakdown(p.stock, p);
            const details = [p.brand, p.size].filter(Boolean).join(' · ');
            const isLow = lowStockItems.includes(p);
            return (
              <Card key={`${p.id}-${idx}`} style={styles.myStockCard}>
                <View style={styles.productTopRow}>
                  <View style={styles.productIcon}>
                    {p.imageUrl ? (
                      <Image source={{ uri: p.imageUrl }} style={styles.productImage} resizeMode="cover" />
                    ) : (
                      <Icon name="package" size={18} color={theme.colors.navy} />
                    )}
                  </View>
                  <View style={styles.flex1}>
                    {p.isMsl && (
                      <View style={styles.focusBadge}>
                        <Text style={styles.focusBadgeText}>MSL</Text>
                      </View>
                    )}
                    <Text style={styles.productName}>{p.name}</Text>
                    <Text style={styles.productMeta}>{details || `SKU ${p.sku}`}</Text>
                    {breakdown ? <Text style={styles.productMeta}>{breakdown}</Text> : null}
                  </View>
                  <View style={styles.myStockQtyCol}>
                    <Text style={styles.myStockQty}>{formatQty(p.stock)}</Text>
                    <Text style={styles.myStockQtyLabel}>{unitWord(stockUnit.uom, p.stock).toUpperCase()}</Text>
                    {isLow && (
                      <View style={styles.lowChip}>
                        <Text style={styles.lowChipText}>Low stock</Text>
                      </View>
                    )}
                  </View>
                </View>
              </Card>
            );
          })}
        </ScrollView>
      )}

      {/* ── My Requests ──────────────────────────────────────────── */}
      {view === 'list' && mainTab === 'requests' && (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {loadingRequests && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={theme.colors.navy} />
              <Text style={styles.loadingText}>Loading your requests…</Text>
            </View>
          )}
          {!loadingRequests && requestsError !== '' && (
            <View style={styles.errorRow}>
              <Icon name="alert-circle" size={14} color={theme.colors.red} />
              <Text style={styles.errorText}>{requestsError}</Text>
            </View>
          )}
          {!loadingRequests && requestsError === '' && stockRequests.length === 0 && (
            <Text style={styles.emptyText}>You haven't submitted any stock requests yet.</Text>
          )}
          {stockRequests.map((r) => {
            const statusLower = r.status.toLowerCase();
            const statusStyle = statusLower.includes('approv')
              ? { bg: theme.colors.visitedBg, text: theme.colors.visitedText }
              : statusLower.includes('reject') || statusLower.includes('cancel')
                ? { bg: theme.colors.redLight, text: theme.colors.red }
                : { bg: theme.colors.skippedBg, text: theme.colors.skippedText };
            return (
              <Card key={r.id} style={styles.requestCard}>
                <View style={styles.requestTopRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.requestId}>{r.id}</Text>
                    {r.createdAt ? <Text style={styles.productMeta}>{formatServerDateTime(r.createdAt)}</Text> : null}
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: statusStyle.text }]}>{r.status}</Text>
                  </View>
                </View>
                {r.items.map((it, idx) => {
                  // Requests are stored in stock units; shown in the product's own units where it's known.
                  const product = products.find((p) => p.id === it.itemCode);
                  const qtyText = formatUnitQty(it.qty, product ? getStockUnit(product).uom : 'unit');
                  const breakdown = product ? formatStockBreakdown(it.qty, product) : '';
                  return (
                    <View key={`${it.itemCode}-${idx}`} style={styles.requestLineRow}>
                      <Text style={styles.requestLineName}>{it.itemName}</Text>
                      <Text style={styles.requestLineQty}>{qtyText}{breakdown ? ` (${breakdown})` : ''}</Text>
                    </View>
                  );
                })}
                {r.note ? <Text style={styles.requestNote}>{r.note}</Text> : null}
              </Card>
            );
          })}
        </ScrollView>
      )}

      {/* ── Basket ───────────────────────────────────────────────── */}
      {view === 'basket' && (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {basketLines.length === 0 && (
            <Text style={styles.emptyText}>Your basket is empty. Add products from the list to request stock.</Text>
          )}
          {basketLines.map((l) => (
            <Card key={l.productId} style={styles.basketLineCard}>
              <View style={styles.productTopRow}>
                <View style={styles.productIcon}>
                  <Icon name="package" size={18} color={theme.colors.navy} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.productName}>{l.product.name}</Text>
                  <Text style={styles.productMeta}>{l.partsText ? `${l.partsText} = ${l.total}` : l.total}</Text>
                </View>
                <Pressable onPress={() => removeBasketLine(l.productId)} style={styles.deleteBtn}>
                  <Icon name="x" size={18} color={theme.colors.red} />
                </Pressable>
              </View>
            </Card>
          ))}

          <View style={styles.basketActionsRow}>
            <Button title="Add more products" onPress={() => setView('list')} variant="outline" style={styles.flex1} />
            <Button title="Review Request" onPress={() => setView('review')} variant="navy" style={styles.flex1} disabled={basketLines.length === 0} />
          </View>
        </ScrollView>
      )}

      {/* ── Review / Submit ──────────────────────────────────────── */}
      {view === 'review' && (
        <ScrollView style={styles.flex1} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Card style={styles.reviewCard}>
            <Text style={styles.reviewCardTitle}>PRODUCTS REQUESTED</Text>
            {basketLines.map((l) => (
              <View key={l.productId} style={styles.reviewLineRow}>
                <View style={styles.flex1}>
                  <Text style={styles.productName}>{l.product.name}</Text>
                  {l.partsText ? <Text style={styles.productMeta}>{l.partsText}</Text> : null}
                </View>
                <Text style={styles.reviewLineUnits}>{l.total}</Text>
              </View>
            ))}
          </Card>

          <Card style={styles.reviewCard}>
            <Text style={styles.reviewCardTitle}>NOTE (OPTIONAL)</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder="Anything your admin should know about this request..."
              placeholderTextColor={theme.colors.textMuted}
              multiline
              numberOfLines={3}
            />
          </Card>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>TOTAL QUANTITY</Text>
            <Text style={styles.totalValue}>{basketTotalUnits} units</Text>
          </View>

          <Button title={submitting ? 'Submitting...' : 'Submit Request'} onPress={handleSubmitRequest} loading={submitting} variant="navy" size="large" />
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const createStyles = (theme: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.appBg },
  content: { padding: theme.spacing.lg, paddingBottom: 190, gap: theme.spacing.md },
  flex1: { flex: 1 },
  segmentWrapper: {
    flexDirection: 'row', marginHorizontal: theme.spacing.lg, marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.md, padding: 4,
  },
  segment: { flex: 1, paddingVertical: 10, borderRadius: theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentActive: { backgroundColor: theme.colors.navy },
  segmentText: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.textMuted },
  segmentTextActive: { color: '#FFFFFF' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: 8, backgroundColor: theme.colors.primaryBg },
  loadingText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.navy },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: theme.spacing.lg, paddingVertical: 8, backgroundColor: theme.colors.redLight },
  errorText: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.red, flex: 1 },
  emptyText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: theme.spacing.xl },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.md, height: 48,
  },
  searchInput: { flex: 1, fontFamily: theme.fonts.regular, fontSize: 14, color: theme.colors.textDark },
  categoryRow: { flexDirection: 'row', gap: theme.spacing.xs, flexWrap: 'wrap' },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.full, backgroundColor: theme.colors.fieldFill },
  categoryChipActive: { backgroundColor: theme.colors.navy },
  categoryChipText: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textMuted },
  categoryChipTextActive: { color: '#FFFFFF', fontFamily: theme.fonts.bold },
  productRow: { borderBottomWidth: 1, borderBottomColor: theme.colors.cardBorder, paddingBottom: theme.spacing.md, gap: theme.spacing.sm },
  productTopRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  productIcon: { width: 44, height: 44, borderRadius: theme.radius.md, backgroundColor: theme.colors.fieldFill, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  productImage: { width: '100%', height: '100%' },
  focusBadge: { alignSelf: 'flex-start', backgroundColor: theme.colors.tintGold, borderRadius: theme.radius.full, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 3 },
  focusBadgeText: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.tintGoldIcon },
  productName: { fontFamily: theme.fonts.bold, fontSize: 15, color: theme.colors.textDark },
  productMeta: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 1 },
  unitList: { gap: 6 },
  unitRow: {
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm,
    backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.md, height: 48, paddingHorizontal: theme.spacing.sm,
  },
  unitRowLabel: { flex: 1, fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.6, paddingLeft: 4 },
  unitStepper: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  stepperBtnDisabled: { opacity: 0.4 },
  stepperBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.cardWhite, alignItems: 'center', justifyContent: 'center' },
  stepperValue: { fontFamily: theme.fonts.bold, fontSize: 16, color: theme.colors.textDark },
  addedText: { fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.navy },
  basketBar: {
    // Inventory is a main-tab screen, so BottomTabs (72px tall) renders as a
    // sibling *after* this screen and paints on top of it — bottom:16 alone
    // would sit directly underneath that tab bar and never be visible.
    position: 'absolute', left: theme.spacing.lg, right: theme.spacing.lg, bottom: 88,
    flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
    backgroundColor: theme.colors.cardWhite, borderRadius: theme.radius.lg, padding: theme.spacing.md, ...theme.shadows.md,
  },
  basketIconBox: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.colors.navy, alignItems: 'center', justifyContent: 'center' },
  basketBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 3, backgroundColor: theme.colors.red, alignItems: 'center', justifyContent: 'center' },
  basketBadgeText: { fontFamily: theme.fonts.bold, fontSize: 10, color: '#FFFFFF' },
  basketBarLabel: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.textMuted, letterSpacing: 0.6 },
  basketBarMeta: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark, marginTop: 1 },
  basketReviewBtn: { backgroundColor: theme.colors.navy, borderRadius: theme.radius.full, paddingHorizontal: theme.spacing.lg, paddingVertical: 10 },
  basketReviewBtnText: { fontFamily: theme.fonts.bold, fontSize: 13, color: '#FFFFFF' },
  lowStockBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm,
    backgroundColor: theme.colors.amberLight, borderRadius: theme.radius.md, padding: theme.spacing.md,
  },
  lowStockBannerText: { flex: 1, fontFamily: theme.fonts.semibold, fontSize: 12, color: theme.colors.textDark },
  requestCard: { gap: theme.spacing.xs },
  requestTopRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  requestId: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  statusBadge: { borderRadius: theme.radius.full, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontFamily: theme.fonts.bold, fontSize: 11 },
  requestLineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  requestLineName: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textDark, flex: 1 },
  requestLineQty: { fontFamily: theme.fonts.bold, fontSize: 13, color: theme.colors.textMuted },
  requestNote: { fontFamily: theme.fonts.regular, fontSize: 12, color: theme.colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  emptyStockText: { fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center', marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.lg },
  myStockCard: { gap: 0 },
  myStockQtyCol: { alignItems: 'flex-end' },
  myStockQty: { fontFamily: theme.fonts.display, fontSize: 20, color: theme.colors.textDark },
  myStockQtyLabel: { fontFamily: theme.fonts.bold, fontSize: 9, color: theme.colors.textMuted, letterSpacing: 0.5 },
  lowChip: { marginTop: 4, backgroundColor: theme.colors.amberLight, borderRadius: theme.radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  lowChipText: { fontFamily: theme.fonts.bold, fontSize: 10, color: theme.colors.amber },
  basketLineCard: { gap: 0 },
  deleteBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  basketActionsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  reviewCard: { gap: theme.spacing.sm },
  reviewCardTitle: { fontFamily: theme.fonts.bold, fontSize: 11, color: theme.colors.textMuted, letterSpacing: 0.8 },
  reviewLineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewLineUnits: { fontFamily: theme.fonts.bold, fontSize: 14, color: theme.colors.textDark },
  noteInput: {
    minHeight: 70, backgroundColor: theme.colors.fieldFill, borderRadius: theme.radius.md,
    padding: theme.spacing.sm, fontFamily: theme.fonts.regular, fontSize: 13, color: theme.colors.textDark, textAlignVertical: 'top',
  },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: theme.spacing.xs },
  totalLabel: { fontFamily: theme.fonts.bold, fontSize: 12, color: theme.colors.textMuted, letterSpacing: 0.6 },
  totalValue: { fontFamily: theme.fonts.display, fontSize: 18, color: theme.colors.textDark },
});
