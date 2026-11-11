import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useFieldStore } from '../store/useFieldStore';
import { getMyOrdersPage, getMySalesPage, getMyStockRequestsPage, HISTORY_PAGE, StockRequestSummary } from '../services/api';
import { OutletOrder, OutletSale } from '../types';

export type HistoryKind = 'sales' | 'orders' | 'stockRequests';

/** The backend's first page of each list: what the day's download and the screens' refresh bring. */
const FIRST_PAGE: Record<HistoryKind, number> = { sales: 50, orders: 20, stockRequests: 50 };

/** Whether the phone has a connection, kept up to date. */
export const useIsOnline = (): boolean => {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((net) => setOnline(net.isConnected !== false && net.isInternetReachable !== false));
    return () => unsubscribe();
  }, []);
  return online;
};

type HistoryRecord = OutletSale | OutletOrder | StockRequestSummary;

/** The document a record belongs to: a sale or order is a record per line. */
const docOf = (record: HistoryRecord): string =>
  'invoiceRef' in record ? record.invoiceRef : 'orderRef' in record ? record.orderRef : record.id;

/** Documents of a kind the phone has. */
export const historyDocs = (kind: HistoryKind, lists: { sales: OutletSale[]; orders: OutletOrder[]; stockRequests: StockRequestSummary[] }): Set<string> =>
  new Set<string>((kind === 'sales' ? lists.sales : kind === 'orders' ? lists.orders : lists.stockRequests).map(docOf));

/** Documents in a page the phone didn't have. */
export const newDocs = (have: Set<string>, records: HistoryRecord[]): number =>
  new Set(records.map(docOf).filter((doc) => !have.has(doc))).size;

/**
 * Whether to offer "Load more": while online, once the list is at least a full
 * first page (so there may be more), and short of the count the list reached
 * when a page came back short (or brought nothing new) — a refresh that brings
 * the list back to its first page offers it again.
 */
export const canLoadMoreHistory = (kind: HistoryKind, loaded: number, online: boolean, endAt: number | null): boolean =>
  online && loaded >= FIRST_PAGE[kind] && (endAt === null || loaded < endAt);

/**
 * Older history for a list, a page at a time, after what the phone has: the
 * day's download keeps only the newest. Sales and orders only reach the list
 * once the server has them (unsent ones are drafts), so what's there is how
 * far into the server's list the phone is.
 */
export const useLoadMore = (kind: HistoryKind) => {
  const { state, dispatch } = useFieldStore();
  const online = useIsOnline();
  const have = historyDocs(kind, state);
  const loaded = have.size;
  const [endAt, setEndAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /** The next page; resolves to what it brought, or null when it couldn't be loaded. */
  const loadMore = async (): Promise<HistoryRecord[] | null> => {
    if (loading) return [];
    setLoading(true);
    setError('');
    try {
      let page: { records: HistoryRecord[]; docs: number };
      if (kind === 'sales') {
        const sales = await getMySalesPage(loaded, HISTORY_PAGE);
        dispatch({ type: 'APPEND_SALES', sales: sales.records });
        page = sales;
      } else if (kind === 'orders') {
        const orders = await getMyOrdersPage(loaded, HISTORY_PAGE);
        dispatch({ type: 'APPEND_ORDERS', orders: orders.records });
        page = orders;
      } else {
        const requests = await getMyStockRequestsPage(loaded, HISTORY_PAGE);
        dispatch({ type: 'APPEND_STOCK_REQUESTS', requests: requests.records });
        page = requests;
      }
      // A short page is the end; so is one with nothing new (a backend that
      // doesn't page sends its first page again).
      const added = newDocs(have, page.records);
      if (page.docs < HISTORY_PAGE || added === 0) setEndAt(loaded + added);
      return page.records;
    } catch {
      setError("Couldn't load more just now. Try again.");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { canLoadMore: canLoadMoreHistory(kind, loaded, online, endAt), loading, error, loadMore };
};
