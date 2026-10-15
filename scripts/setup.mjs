import fs from 'node:fs';
import path from 'node:path';
import { configDir, dataDir, ensureAppDirectories } from '../src/lib/paths.mjs';

ensureAppDirectories();
for (const name of ['resumes', 'research']) fs.mkdirSync(path.join(dataDir, name), { recursive: true });
for (const name of ['search.config', 'matching.config', 'candidate-profile', 'recruiting-policy']) {
  const destination = path.join(configDir, `${name}.json`);
  if (!fs.existsSync(destination)) {
    fs.copyFileSync(path.join(configDir, `${name}.example.json`), destination);
    console.log(`Created config/${name}.json`);
  }
}
console.log('Local configuration is ready. Edit the search and profile files before using BOSS or AI drafting.');
