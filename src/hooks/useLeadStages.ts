import { useEffect } from 'react';
import { useFieldStore } from '../store/useFieldStore';
import { getLeadStages, NetworkError } from '../services/api';
import { DEFAULT_LEAD_STAGES, setLeadStageList } from '../utils/leadStages';
import { LeadStageInfo } from '../types';

// Loaded once per app run. Only a load that couldn't reach the server is
// tried again (by the next screen that asks); a backend without
// get_lead_stages won't have it later in the run either.
let loaded = false;

/**
 * The lead stages in order: the backend's (get_lead_stages, kept on the
 * device) or the built-in list. The first screen to ask loads them.
 */
export const useLeadStages = (): LeadStageInfo[] => {
  const { state, dispatch } = useFieldStore();

  useEffect(() => {
    if (loaded) return;
    loaded = true;
    getLeadStages()
      .then((stages) => {
        if (stages.length === 0) return;
        // Before the store, so the plain functions (mapLead, the pipeline
        // metrics) already use it when the screens re-render.
        setLeadStageList(stages);
        dispatch({ type: 'SET_LEAD_STAGES', stages });
      })
      .catch((e) => { if (e instanceof NetworkError) loaded = false; });
  }, []);

  return state.leadStages ? [...state.leadStages].sort((a, b) => a.order - b.order) : DEFAULT_LEAD_STAGES;
};
