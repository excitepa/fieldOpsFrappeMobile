import { useEffect, useState } from 'react';
import { useFieldStore } from '../store/useFieldStore';
import { getOutletTypes, getOutletChannels, getOutletSubChannels, getMyDistributors } from '../services/api';
import { OutletFormOptions } from '../types';

/**
 * The Add/Edit Outlet pickers' lists. Each is loaded fresh when the form
 * opens and kept on the device after it loads; when a load fails (offline,
 * or a backend without get_my_distributors) the copy kept from last time is
 * used, and a list that has never loaded stays unset. `loading` is true until
 * every list has answered once.
 */
export const useOutletFormOptions = (): { options: OutletFormOptions; loading: boolean } => {
  const { state, dispatch } = useFieldStore();
  const [pending, setPending] = useState(4);

  useEffect(() => {
    let active = true;
    const settled = () => { if (active) setPending((n) => n - 1); };
    const keep = (options: Partial<OutletFormOptions>) => dispatch({ type: 'SET_OUTLET_FORM_OPTIONS', options });

    getOutletTypes().then((types) => keep({ types })).catch(() => {}).finally(settled);
    getOutletChannels().then((channels) => keep({ channels })).catch(() => {}).finally(settled);
    getOutletSubChannels().then((subChannels) => keep({ subChannels })).catch(() => {}).finally(settled);
    getMyDistributors()
      .then(({ distributors, defaultId }) => keep({ distributors, defaultDistributorId: defaultId }))
      .catch(() => {})
      .finally(settled);
    return () => {
      active = false;
    };
  }, []);

  return { options: state.outletFormOptions, loading: pending > 0 };
};
