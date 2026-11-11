import { useCallback, useRef, useState } from 'react';
import { useFieldStore } from '../store/useFieldStore';
import { DayPackProgress, DayPackResult, downloadDay, isDayPackDone, lastUpdatedAt } from '../utils/dayPack';

/**
 * The day's download as a screen sees it: whether today's has all come in,
 * when the phone's data was last brought up to date, and a way to (re)run it.
 */
export const useDayPack = () => {
  const { state, dispatch } = useFieldStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<DayPackProgress | null>(null);

  const run = useCallback(async (campaignId?: string): Promise<DayPackResult> => {
    setRunning(true);
    try {
      return await downloadDay({
        campaignId: campaignId || stateRef.current.activeCampaign?.id,
        agentEmail: stateRef.current.user.email?.trim().toLowerCase() || undefined,
        dispatch,
        getState: () => stateRef.current,
        onProgress: setProgress,
      });
    } finally {
      setRunning(false);
    }
  }, [dispatch]);

  return {
    done: isDayPackDone(state.dayPack, state.user.email),
    lastUpdated: lastUpdatedAt(state.dayPack),
    running,
    progress,
    run,
  };
};
