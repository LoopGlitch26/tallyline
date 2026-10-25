import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Property, ViewState } from './api';

/** Shared state for everything on a property's dashboard. */
export interface Board {
  property: Property;
  view: ViewState;
  version: number;
  digits: number;
  cash: (minor: number, short?: boolean) => string;
  addFilter: (dimension: string, value: string) => void;
  openPerson: (uid: string) => void;
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
  goal: 'Completed goal',
  outbound: 'Outbound link',
};
