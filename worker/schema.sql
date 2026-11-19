-- D1 database for accounts and online stats (worker/accounts.js).
-- Apply: npx wrangler d1 execute ygoduelorigins --remote --file worker/schema.sql
-- Databases made before the avatar and team columns: ALTER TABLE users ADD COLUMN avatar TEXT; ... ADD COLUMN team TEXT;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,            -- Discord user id
  name TEXT NOT NULL,
  avatar TEXT,                    -- Discord avatar hash; null: Discord's default picture
  team TEXT,                      -- slifer | ra | obelisk, chosen once on first sign-in
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
-- Each player's own word on a finished online duel; a duel counts once both players' reports agree.
CREATE TABLE IF NOT EXISTS reports (
  match TEXT NOT NULL,            -- SHA-256 of the duel's seed: both players know it, nobody else picks it
  user TEXT NOT NULL,
  opponent TEXT NOT NULL,
  result TEXT NOT NULL,           -- win | loss | draw, from the reporter's side
  lp INTEGER,                     -- the reporter's LP when the duel ended, and the opponent's: settles two claimed wins
  opp_lp INTEGER,
  at INTEGER NOT NULL,
  PRIMARY KEY (match, user)
);
-- Each player's word that an online duel began: a player who then leaves without a result loses it (abandoned()).
CREATE TABLE IF NOT EXISTS starts (
  match TEXT NOT NULL,
  user TEXT NOT NULL,
  opponent TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (match, user)
);
-- Counted duels; the primary key stops a duel from counting twice.
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  winner TEXT,                    -- null for a draw
  at INTEGER NOT NULL
);
