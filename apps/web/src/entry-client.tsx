import { mount, StartClient } from 'solid-start/entry-client';
import Plausible from 'plausible-tracker';

const plausible = Plausible({
  domain: 'lets.church',
});

plausible.enableAutoPageviews();
plausible.enableAutoOutboundTracking();

mount(() => <StartClient />, document);
