import { ShareBar, SliceTable } from '../parts/breakdown';
import { Shell } from '../parts/shell';
import { periodLine } from './overview';

export function AcquisitionView() {
  return (
    <Shell title="Acquisition" subtitle={periodLine()}>
      <div class="cols">
        <ShareBar by="channel" title="Visitors by channel" />
        <ShareBar by="channel" title="Revenue by channel" value="revenue" />
      </div>
      <SliceTable title="Sources" dims={['source', 'referrer']} limit={12} />
      <div class="cols">
        <SliceTable title="Campaigns" dims={['campaign', 'utm_source', 'utm_medium', 'utm_content']} limit={8} />
        <SliceTable title="Tags and keywords" dims={['tag', 'keyword']} limit={8} />
      </div>
      <SliceTable title="Locations" dims={['country', 'region', 'city']} limit={10} />
    </Shell>
  );
}
