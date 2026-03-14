#!/usr/bin/env node
/**
 * enrich-states.js
 * Enriches src/data/states-business.json with property tax rates and job openings data
 * from sibling portal databases. Exits gracefully if DBs are not found.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const dataPath = resolve(projectRoot, 'src/data/states-business.json');

// Try to load better-sqlite3
let Database;
try {
  const mod = await import('better-sqlite3');
  Database = mod.default;
} catch {
  console.log('[enrich-states] better-sqlite3 not available — skipping enrichment');
  process.exit(0);
}

// Load existing data
const states = JSON.parse(readFileSync(dataPath, 'utf8'));
const stateMap = {};
for (const s of states) {
  stateMap[s.abbr] = s;
}

// --- Property Tax from PlainPropertyTax ---
const propTaxDb = resolve(__dirname, '../../portal-plainpropertytax/data/plainpropertytax.db');
let propTaxLoaded = false;
try {
  const db = new Database(propTaxDb, { readonly: true });
  const rows = db.prepare(`
    SELECT s.state_abbr, t.effective_rate
    FROM tax_state t
    JOIN states s ON t.state_code = s.state_code
    WHERE t.year = (SELECT MAX(year) FROM tax_state)
  `).all();
  db.close();

  for (const row of rows) {
    if (stateMap[row.state_abbr]) {
      stateMap[row.state_abbr].propertyTax = row.effective_rate;
    }
  }
  console.log(`[enrich-states] Loaded ${rows.length} property tax records`);
  propTaxLoaded = true;
} catch (err) {
  console.log(`[enrich-states] PlainPropertyTax DB not available: ${err.message}`);
}

// --- Job Openings from PlainLabor ---
const laborDb = resolve(__dirname, '../../portal-plainlabor/data/plainlabor.db');
let laborLoaded = false;
try {
  const db = new Database(laborDb, { readonly: true });

  // Check if jolts table exists
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map(t => t.name);

  if (tableNames.includes('jolts') && tableNames.includes('states')) {
    const rows = db.prepare(`
      SELECT s.state_abbr, AVG(j.openings_rate) as avg_openings
      FROM jolts j
      JOIN states s ON j.state_fips = s.state_fips
      WHERE j.year = (SELECT MAX(year) FROM jolts)
      GROUP BY s.state_abbr
    `).all();
    db.close();

    for (const row of rows) {
      if (stateMap[row.state_abbr]) {
        stateMap[row.state_abbr].jobOpenings = parseFloat(row.avg_openings.toFixed(1));
      }
    }
    console.log(`[enrich-states] Loaded ${rows.length} job openings records`);
    laborLoaded = true;
  } else {
    db.close();
    console.log('[enrich-states] PlainLabor DB has no jolts table — skipping job openings');
  }
} catch (err) {
  console.log(`[enrich-states] PlainLabor DB not available: ${err.message}`);
}

if (!propTaxLoaded && !laborLoaded) {
  console.log('[enrich-states] No enrichment sources available — states-business.json unchanged');
  process.exit(0);
}

// Write enriched data
const enriched = Object.values(stateMap);
writeFileSync(dataPath, JSON.stringify(enriched, null, 2));
console.log(`[enrich-states] Wrote ${enriched.length} states to ${dataPath}`);
