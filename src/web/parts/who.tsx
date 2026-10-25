import type { ComponentChildren } from 'preact';
import { country, nickname } from '../core/format';
import { Avatar, BrowserMark, DeviceMark, Flag, OsMark } from './icons';

/** Avatar, name (or a stable nickname for anonymous visitors) and where/what they browse with. */
export function Who({
  uid,
  name,
  email,
  countryCode,
  city,
  device,
  os,
  browser,
  badge,
  compact,
}: {
  uid: string;
  name?: string | null;
  email?: string | null;
  countryCode?: string | null;
  city?: string | null;
  device?: string | null;
  os?: string | null;
  browser?: string | null;
  badge?: ComponentChildren;
  compact?: boolean;
}) {
  return (
    <div class={`who${compact ? ' compact' : ''}`}>
      <Avatar seed={uid} size={compact ? 32 : 38} />
      <div class="who-text">
        <div class="who-name">
          <span class="ellipsis">{name || email || nickname(uid)}</span>
          {badge}
        </div>
        <div class="who-meta">
          <span>
            <Flag code={countryCode} size={12} /> {city ? `${city}, ` : ''}
            {country(countryCode)}
          </span>
          {!compact && (
            <>
              <span>
                <DeviceMark name={device ?? null} /> {device}
              </span>
              <span>
                <OsMark name={os ?? null} /> {os}
              </span>
              <span>
                <BrowserMark name={browser ?? null} /> {browser}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
