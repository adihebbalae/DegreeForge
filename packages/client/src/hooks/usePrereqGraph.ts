import { useMemo } from 'react';
import { PrereqGraph } from '../lib/graph-engine';
import { usePrereqGraph as useRawPrereqGraph } from '../context/DataContext';

/**
 * Returns a memoized instance of the PrereqGraph class, 
 * initialized with the raw nodes/edges from DataContext.
 */
export function usePrereqGraph() {
  const rawData = useRawPrereqGraph();
  return useMemo(() => new PrereqGraph(rawData), [rawData]);
}
