import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Property, Summary, ViewState } from './api';

export type Section = 'overview' | 'acquisition' | 'behavior' | 'revenue' | 'people' | 'funnels' | 'setup';

export const SECTIONS: { key: Section; label: string; hint: string }[] = [
  { key: 'overview', label: 'Overview', hint: 'Key numbers, trend and recent payments' },
  { key: 'acquisition', label: 'Acquisition', hint: 'Channels, sources, campaigns and locations' },
  { key: 'behavior', label: 'Behavior', hint: 'Pages, goals, outbound links and devices' },
  { key: 'revenue', label: 'Revenue', hint: 'Every payment and the source credited' },
  { key: 'people', label: 'People', hint: 'Recent visitors and customers' },
  { key: 'funnels', label: 'Funnels', hint: 'Step-by-step conversion paths' },
  { key: 'setup', label: 'Setup', hint: 'Install, payments, API and settings' },
];

/** Shared state for everything inside one website's dashboard. */
export interface Board {
  property: Property;
  properties: Property[];
  section: Section;
  view: ViewState;
  change: (patch: Partial<ViewState>) => void;
  version: number;
  refresh: () => void;
  summary: Summary | null;
  digits: number;
  cash: (minor: number, short?: boolean) => string;
  addFilter: (dimension: string, value: string) => void;
  openPerson: (uid: string) => void;
  goSection: (s: Section) => void;
  compare: boolean;
  setCompare: (on: boolean) => void;
}

export const BoardContext = createContext<Board | null>(null);

export function useBoard(): Board {
  const b = useContext(BoardContext);
  if (!b) throw new Error('useBoard outside BoardContext');
  return b;
}

/** Labels for filter chips and breakdown tabs. */
export const DIMENSION_NAMES: Record<string, string> = {
  channel: 'Channel',
  source: 'Source',
  referrer: 'Referrer page',
  campaign: 'Campaign',
  keyword: 'Keyword',
  utm_source: 'UTM source',
  utm_medium: 'UTM medium',
  utm_content: 'UTM content',
  tag: 'Ref tag',
  country: 'Country',
  region: 'Region',
  city: 'City',
  browser: 'Browser',
  os: 'OS',
  device: 'Device',
  landing: 'Landing page',
  exit_page: 'Exit page',
  host_name: 'Hostname',
  page: 'Visited page',
  goal: 'Goal',
  outbound: 'Outbound link',
};
