import { Signal, useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import * as backend from "../utils/backend";
import { TimeBonusPlotPayload } from "../utils/backend";
import { TimeBonus } from "@yasq/shared";

/**
 * Fetch and cache sample data to display in a {@link TimeBonusPlot} for each variant of {@link TimeBonus}.
 */
export const useTimeBonusSamples = (isHost: boolean): {
  timeBonusSamples: Signal<Map<TimeBonus, TimeBonusPlotPayload>>;
  isLoading: Signal<boolean>;
} => {
  const samplesCache = useSignal<Map<TimeBonus, TimeBonusPlotPayload>>(new Map());
  const isLoading = useSignal(false);

  useEffect(() => {
    if (!isHost || samplesCache.value.size > 0) return;

    // Prefetch the time bonus plot payload for each time bonus type
    isLoading.value = true;
    Promise.all(
      Object.keys(TimeBonus).map(async (bonusType) => {
        try {
          const payload = await backend.getSampleTimeBonusSummary(bonusType as TimeBonus);
          return [bonusType, payload] as const;
        } catch (err) {
          console.error(`Failed to prefetch sample for bonus type ${bonusType}:`, err);
          return null;
        }
      })
    ).then((results) => {
      const newSamplesMap = new Map<TimeBonus, TimeBonusPlotPayload>();
      for (const result of results) {
        if (result) {
          const [bonusType, payload] = result;
          newSamplesMap.set(bonusType as TimeBonus, payload);
        }
      }

      samplesCache.value = newSamplesMap;
      isLoading.value = false;
    });
  }, [isHost]);

  return { timeBonusSamples: samplesCache, isLoading };
};