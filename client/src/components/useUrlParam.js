import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Fill a page filter from the address bar, e.g. /inventory?search=dell (used by the global search). */
export function useUrlParam(key, setter) {
  const [params] = useSearchParams();
  const value = params.get(key);
  useEffect(() => {
    if (value !== null) setter(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
}
