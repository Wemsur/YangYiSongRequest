#!/usr/bin/env node
/**
 * Database migration script for NixOS environments where Prisma CLI has issues.
 * This script applies all pending migrations directly using better-sqlite3.
 *
 * Usage:
 *   node scripts/migrate-db.mjs
 *   npm run migrate:db
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(__dirname, '..');
const prismaDir = path.join(serverDir, 'prisma');
const dataDir = path.join(serverDir, 'data');
const migrationDir = path.join(prismaDir, 'migrations');
const dbPath = path.join(dataDir, 'app.db');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`✓ Created data directory: ${dataDir}`);
}

// Get all migration folders
const migrationFolders = fs
  .readdirSync(migrationDir)
  .filter((name) => {
    const fullPath = path.join(migrationDir, name);
    return fs.statSync(fullPath).isDirectory();
  })
  .sort(); // Migrations are run in alphabetical order

if (migrationFolders.length === 0) {
  console.log('✗ No migrations found');
  process.exit(1);
}

const db = new Database(dbPath);

try {
  // Create or verify migration tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      finished_at DATETIME,
      execution_time INTEGER NOT NULL,
      success BOOLEAN NOT NULL DEFAULT 0,
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      migration_name TEXT NOT NULL
    );
  `);

  let migrationsApplied = 0;

  for (const folder of migrationFolders) {
    const migrationPath = path.join(migrationDir, folder, 'migration.sql');
    if (!fs.existsSync(migrationPath)) {
      console.warn(`⚠ Migration file not found: ${migrationPath}`);
      continue;
    }

    // Check if already applied
    const existing = db.prepare('SELECT id FROM "_prisma_migrations" WHERE id = ?').get(folder);
    if (existing) {
      console.log(`⊘ Already applied: ${folder}`);
      continue;
    }

    // Read migration SQL
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

    try {
      const startTime = Date.now();
      db.exec(migrationSql);
      const duration = Date.now() - startTime;

      // Record migration
      db.prepare(
        `INSERT INTO "_prisma_migrations" 
         (id, checksum, finished_at, execution_time, success, migration_name) 
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        folder,
        'none', // Checksum not needed for this implementation
        new Date().toISOString(),
        duration,
        1,
        folder
      );

      console.log(`✓ Applied: ${folder} (${duration}ms)`);
      migrationsApplied++;
    } catch (error) {
      // Handle cases where migration was already applied
      const msg = error.message;
      const isAlreadyApplied =
        msg.includes('already exists') ||
        msg.includes('duplicate column') ||
        msg.includes('UNIQUE constraint failed');

      if (isAlreadyApplied) {
        console.log(`⊘ Already applied: ${folder} (${error.message})`);
        // Record as applied
        try {
          db.prepare(
            `INSERT INTO "_prisma_migrations" 
             (id, checksum, finished_at, execution_time, success, migration_name) 
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(folder, 'none', new Date().toISOString(), 0, 1, folder);
        } catch (e) {
          // Migration already in tracking table
        }
      } else {
        console.error(`✗ Failed to apply migration ${folder}:`, error.message);
        process.exit(1);
      }
    }
  }

  // Verify tables were created (exclude internal Prisma tables)
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma%' ORDER BY name"
    )
    .all();

  console.log('\n✓ Database tables:');
  tables.forEach((t) => console.log(`  - ${t.name}`));

  if (migrationsApplied > 0) {
    console.log(`\n✓ Successfully applied ${migrationsApplied} migration(s)`);
  } else {
    console.log('\n✓ Database is up to date');
  }
} catch (error) {
  console.error('✗ Database migration failed:', error.message);
  process.exit(1);
} finally {
  db.close();
}
