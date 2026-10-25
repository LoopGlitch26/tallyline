import { useCallback, useEffect, useState } from 'preact/hooks';
import { call, type Filters, type Step, type ViewState } from './api';

/** GET a JSON endpoint; refetches when `path` or `version` changes. Pass null to skip. */
export function useFetch<T>(path: string | null, version = 0) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: !!path });
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    call<T>(path)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((e: Error) => live && setState((s) => ({ ...s, error: e.message, loading: false })));
    return () => {
      live = false;
    };
  }, [path, version]);
  return state;
}

function readUrl(): ViewState {
  const q = new URLSearchParams(location.search);
  let filters: Filters = {};
  try {
    filters = JSON.parse(q.get('f') ?? '{}');
  } catch {
    filters = {};
  }
  return {
    preset: q.get('preset') ?? 'last30',
    from: q.get('from') ?? undefined,
    to: q.get('to') ?? undefined,
    step: (q.get('step') as Step | null) ?? undefined,
    filters,
  };
}

/** Date range, chart step and filters are kept in the address bar so links and reloads keep them. */
export function useViewState() {
  const [view, setView] = useState<ViewState>(readUrl);
  useEffect(() => {
    const sync = () => setView(readUrl());
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);
  const change = useCallback((patch: Partial<ViewState>) => {
    setView((cur) => {
      const next: ViewState = { ...cur, ...patch };
      if (patch.preset && patch.preset !== 'range') {
        next.from = undefined;
        next.to = undefined;
      }
      const q = new URLSearchParams({ preset: next.preset });
      if (next.from) q.set('from', next.from);
      if (next.to) q.set('to', next.to);
      if (next.step) q.set('step', next.step);
      if (Object.keys(next.filters).length) q.set('f', JSON.stringify(next.filters));
      history.replaceState(null, '', `${location.pathname}?${q}`);
      return next;
    });
  }, []);
  return [view, change] as const;
}

export function useCopy(): [boolean, (text: string) => void] {
  const [done, setDone] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  }, []);
  return [done, copy];
}
