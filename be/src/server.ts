import { createApp } from './app';
import { config } from './config';
import { closeDueAuctions } from './lib/settlement';

createApp().listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

// Background closer so auctions settle even when nobody is browsing.
setInterval(() => {
  closeDueAuctions().catch((err) => console.error('closeDueAuctions failed', err));
}, 5000);
