import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { reportQuery, type Property, type Summary } from '../core/api';
import { BoardContext, SECTIONS, type Board, type Section } from '../core/board';
import { money } from '../core/format';
import { useFetch, useViewState } from '../core/hooks';
import { go } from '../core/nav';
import { PersonDrawer } from '../parts/person';
import { Skeleton } from '../parts/ui';
import { AcquisitionView } from './acquisition';
import { BehaviorView } from './behavior';
import { FunnelsView } from './funnels';
import { OverviewView } from './overview';
import { PeopleView } from './people';
import { RevenueView } from './revenue';
import { SetupView } from './setup';

function readCompare(): boolean {
  try {
    return localStorage.getItem('tl-compare') !== '0';
  } catch {
    return true;
  }
}

/** Everything for one website: shared state, then the view for the current section. */
export function Workspace({ pid, section }: { pid: string; section: Section }) {
  const [view, change] = useViewState();
  const [version, setVersion] = useState(0);
  const [person, setPerson] = useState<string | null>(null);
  const [compare, setCompareState] = useState(readCompare);
  const { data: properties } = useFetch<Property[]>('/api/properties', version);
  const property = properties?.find((p) => p.id === pid);
  const { data: summary } = useFetch<Summary>(property ? `/api/properties/${pid}/summary?${reportQuery(view)}` : null, version);

  const addFilter = useCallback((dim: string, value: string) => change({ filters: { ...view.filters, [dim]: value } }), [view.filters, change]);
  const setCompare = useCallback((on: boolean) => {
    setCompareState(on);
    try {
      localStorage.setItem('tl-compare', on ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    const label = SECTIONS.find((s) => s.key === section)?.label ?? '';
    document.title = property ? `${label} · ${property.label} · Tallyline` : 'Tallyline';
  }, [section, property?.label]);

  const board = useMemo<Board | null>(() => {
    if (!property || !properties) return null;
    const digits = summary?.digits ?? 2;
    return {
      property,
      properties,
      section,
      view,
      change,
      version,
      refresh: () => setVersion((v) => v + 1),
      summary,
      digits,
      cash: (minor, short) => money(minor, property.currency, digits, short),
      addFilter,
      openPerson: setPerson,
      goSection: (s) => go(`/p/${property.id}/${s}${location.search}`),
      compare,
      setCompare,
    };
  }, [property, properties, section, view, change, version, summary, addFilter, compare, setCompare]);

  if (properties && !property)
    return (
      <div class="solo">
        <div class="solo-card">
          <h2>Website not found</h2>
          <p class="muted">It may have been deleted.</p>
          <button class="btn primary" onClick={() => go('/')}>
            Back to websites
          </button>
        </div>
      </div>
    );
  if (!board) return <div class="solo"><Skeleton height={420} /></div>;

  const View = {
    overview: OverviewView,
    acquisition: AcquisitionView,
    behavior: BehaviorView,
    revenue: RevenueView,
    people: PeopleView,
    funnels: FunnelsView,
    setup: SetupView,
  }[section];

  return (
    <BoardContext.Provider value={board}>
      <View />
      <PersonDrawer key={person ?? 'none'} uid={person} onClose={() => setPerson(null)} />
    </BoardContext.Provider>
  );
}
