import type { Point, Totals } from './api';
import { duration, num, pct } from './format';

export type MetricKey = 'visitors' | 'revenue' | 'conversion' | 'rpv' | 'bounce' | 'duration';

export interface Metric {
  key: MetricKey;
  label: string;
  /** One-line explanation shown on hover. */
  hint: string;
  total: (t: Totals) => number;
  point: (p: Point) => number;
  /** Format a value; `cash` formats minor currency units. */
  format: (v: number, cash: (minor: number, short?: boolean) => string, short?: boolean) => string;
  lowerIsBetter?: boolean;
  money?: boolean;
}

const ratio = (a: number, b: number) => (b ? a / b : 0);

export const METRICS: Metric[] = [
  {
    key: 'revenue',
    label: 'Net revenue',
    hint: 'Payments minus refunds in this period',
    total: (t) => t.revenue,
    point: (p) => p.revenue,
    format: (v, cash, short) => cash(v, short),
    money: true,
  },
  {
    key: 'visitors',
    label: 'Visitors',
    hint: 'Unique browsers that visited',
    total: (t) => t.visitors,
    point: (p) => p.visitors,
    format: (v) => num(v),
  },
  {
    key: 'conversion',
    label: 'Conversion',
    hint: 'New paying customers ÷ visitors',
    total: (t) => t.conversionRate,
    point: (p) => ratio(p.customers, p.visitors),
    format: (v) => pct(v),
  },
  {
    key: 'rpv',
    label: 'Revenue / visitor',
    hint: 'Net revenue ÷ visitors',
    total: (t) => t.revenuePerVisitor,
    point: (p) => ratio(p.revenue, p.visitors),
    format: (v, cash) => cash(v),
    money: true,
  },
  {
    key: 'bounce',
    label: 'Bounce rate',
    hint: 'Visits with one page and no goal',
    total: (t) => t.bounceRate,
    point: (p) => ratio(p.bounces, p.visits),
    format: (v) => pct(v, 0),
    lowerIsBetter: true,
  },
  {
    key: 'duration',
    label: 'Visit time',
    hint: 'Average time a visit spent with the tab in front',
    total: (t) => t.avgEngagedMs,
    point: (p) => ratio(p.engagedMs, p.visits),
    format: (v) => duration(v),
  },
];

export const metricByKey = (k: string) => METRICS.find((m) => m.key === k) ?? METRICS[0];
