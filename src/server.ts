// SPDX-License-Identifier: MIT

import { RakomiClient } from '@rakomi/node';

import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const client = new RakomiClient({
  apiKey: config.apiKey,
  baseUrl: config.apiBaseUrl,
  clientId: config.clientId,
  clientSecret: config.clientSecret,
});

const app = createApp({ config, client });

app.listen(config.port, () => {
  console.log(`Rakomi Node/Express quickstart listening on http://localhost:${config.port}`);
});
