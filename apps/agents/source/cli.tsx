#!/usr/bin/env node
import Pastel from 'pastel';
import { registerAppConfig } from '@conductor/core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Register app-specific config (apps/agents/config.json)
const __dirname = dirname(fileURLToPath(import.meta.url));
const appConfigPath = join(__dirname, '..', 'config.json');
registerAppConfig(appConfigPath);

const app = new Pastel({
	importMeta: import.meta,
});

await app.run();
