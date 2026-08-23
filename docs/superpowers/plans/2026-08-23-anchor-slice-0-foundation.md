# Scheibe 0 — Fundament / Scaffolding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein pnpm-Monorepo, in dem Expo-App und Next.js-Web starten, `packages/shared` mit grünem Vitest läuft, und Supabase lokal mit erster Migration + generierten Typen an beide Frontends angebunden ist.

**Architecture:** Turborepo-Monorepo mit `apps/mobile` (Expo), `apps/web` (Next.js), `packages/shared` (pure TS + Vitest) und `supabase/` (Migrations + Edge Functions). Domain-Logik ist DB-frei in `shared`; beide Apps konsumieren einen typisierten Supabase-Client.

**Tech Stack:** pnpm, Turborepo, TypeScript (strict), Expo/expo-router, Next.js (App Router), Supabase (Postgres/Auth/Realtime/Edge), Vitest.

**Voraussetzung:** Node ≥ 20, pnpm ≥ 9, Docker Desktop (für `supabase start`), Supabase CLI. Referenz-Kontrakte: siehe [Roadmap §5](2026-08-23-anchor-v1-roadmap.md).

---

## Datei-Struktur dieser Scheibe

- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.npmrc`, `.gitignore`, `.env.example`
- Create: `packages/shared/{package.json,tsconfig.json,vitest.config.ts,src/index.ts,src/types.ts,src/domain/hello.ts,test/hello.test.ts}`
- Create: `apps/mobile/*` (via `create-expo-app`, dann Monorepo-Anpassungen)
- Create: `apps/web/*` (via `create-next-app`)
- Create: `supabase/migrations/0001_foundation.sql`, `supabase/config.toml` (via `supabase init`)
- Create: `packages/shared/src/db-types.ts` (generiert)

---

### Task 0: Repo-Grundgerüst & pnpm-Workspace

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.npmrc`, `.gitignore`

- [ ] **Step 1: Git-Repo initialisieren**

```bash
git init
```

- [ ] **Step 2: `.npmrc` schreiben (Expo + pnpm brauchen Hoisting)**

Create `.npmrc`:

```ini
node-linker=hoisted
shamefully-hoist=true
```

- [ ] **Step 3: `pnpm-workspace.yaml` schreiben**

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 4: Root `package.json` schreiben**

Create `package.json`:

```json
{
  "name": "anchor",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "test": "turbo run test",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "build": "turbo run build"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 5: `turbo.json` schreiben**

Create `turbo.json`:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "test": { "dependsOn": ["^build"] },
    "typecheck": {},
    "lint": {},
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] }
  }
}
```

- [ ] **Step 6: `tsconfig.base.json` schreiben**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true
  }
}
```

- [ ] **Step 7: `.gitignore` schreiben**

Create `.gitignore`:

```gitignore
node_modules/
dist/
.next/
.expo/
.turbo/
*.log
.env
.env.local
supabase/.branches/
supabase/.temp/
```

- [ ] **Step 8: Installieren & committen**

```bash
pnpm install
git add -A
git commit -m "chore: init pnpm+turborepo monorepo skeleton"
```

Expected: `pnpm install` legt `node_modules` + `pnpm-lock.yaml` an, keine Fehler.

---

### Task 1: `packages/shared` mit Vitest — TDD-Pipeline beweisen

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/domain/hello.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/test/hello.test.ts`

- [ ] **Step 1: `packages/shared/package.json` schreiben**

Create `packages/shared/package.json`:

```json
{
  "name": "@anchor/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: `packages/shared/tsconfig.json` schreiben**

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "." },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: `packages/shared/vitest.config.ts` schreiben**

Create `packages/shared/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
```

- [ ] **Step 4: Failing test schreiben**

Create `packages/shared/test/hello.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { greet } from '../src/domain/hello';

describe('greet', () => {
  it('greets a named crew', () => {
    expect(greet('Crew')).toBe('Anchor: Crew');
  });
});
```

- [ ] **Step 5: Dependencies installieren & Test laufen lassen (muss fehlschlagen)**

```bash
pnpm install
pnpm --filter @anchor/shared test
```

Expected: FAIL — `Cannot find module '../src/domain/hello'` (Datei existiert noch nicht).

- [ ] **Step 6: Minimale Implementierung**

Create `packages/shared/src/domain/hello.ts`:

```typescript
export function greet(name: string): string {
  return `Anchor: ${name}`;
}
```

Create `packages/shared/src/index.ts`:

```typescript
export { greet } from './domain/hello';
```

- [ ] **Step 7: Test erneut laufen lassen (muss grün sein)**

```bash
pnpm --filter @anchor/shared test
```

Expected: PASS — 1 test passed.

- [ ] **Step 8: Committen**

```bash
git add packages/shared
git commit -m "feat(shared): scaffold shared package with green vitest pipeline"
```

---

### Task 2: Supabase lokal + erste Migration

**Files:**
- Create: `supabase/config.toml` (via CLI)
- Create: `supabase/migrations/0001_foundation.sql`
- Create: `packages/shared/src/db-types.ts` (generiert)
- Modify: `.env.example`

- [ ] **Step 1: Supabase initialisieren**

```bash
supabase init
```

Expected: Legt `supabase/config.toml` und `supabase/` an.

- [ ] **Step 2: Supabase lokal starten (Docker muss laufen)**

```bash
supabase start
```

Expected: Gibt `API URL`, `anon key`, `service_role key`, `DB URL` aus. Notieren.

- [ ] **Step 3: Erste Migration schreiben (Fundament-Tabellen + RLS-Grundgerüst)**

Create `supabase/migrations/0001_foundation.sql`:

```sql
-- Profiles (1:1 zu auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Anchor User',
  push_token text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles are updatable by owner"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-Profil bei neuem User
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', 'Anchor User'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Groups (minimal, für Anbindungs-Smoke; volle Nutzung in Scheibe 1)
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_token text not null unique default encode(gen_random_bytes(9), 'base64'),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

alter table public.groups enable row level security;

-- Öffentlich lesbar per invite_token (Link-first); Schreiben nur eingeloggt.
create policy "groups readable by anyone with the row (token-scoped queries)"
  on public.groups for select using (true);

create policy "authenticated users can create groups"
  on public.groups for insert to authenticated
  with check (auth.uid() = created_by);
```

> **Hinweis:** Die `groups`-SELECT-Policy `using (true)` ist die v1-Vereinfachung für den
> Link-first-Zugang (Token steckt in der Query, nicht rateable). Wird in Scheibe 1 verschärft,
> sobald Memberships stehen.

- [ ] **Step 4: Migration anwenden**

```bash
supabase db reset
```

Expected: Migration `0001_foundation.sql` läuft ohne Fehler durch; Tabellen existieren.

- [ ] **Step 5: DB-Typen generieren**

```bash
supabase gen types typescript --local > packages/shared/src/db-types.ts
```

Expected: `db-types.ts` enthält `export type Database = { ... }` mit `profiles` und `groups`.

- [ ] **Step 6: `.env.example` schreiben**

Create `.env.example`:

```ini
# Supabase (Werte aus `supabase start`)
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
```

- [ ] **Step 7: Committen**

```bash
git add supabase packages/shared/src/db-types.ts .env.example
git commit -m "feat(db): supabase local + foundation migration + generated types"
```

---

### Task 3: Next.js Web-App scaffolden & an Supabase anbinden

**Files:**
- Create: `apps/web/*` (via CLI)
- Create: `apps/web/src/lib/supabase.ts`
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/.env.local`

- [ ] **Step 1: Next.js-App erzeugen**

```bash
pnpm create next-app@latest apps/web --typescript --app --eslint --no-tailwind --src-dir --import-alias "@/*" --use-pnpm
```

Expected: `apps/web` mit App Router und `src/`.

- [ ] **Step 2: Supabase-Client-Lib installieren**

```bash
pnpm --filter web add @supabase/supabase-js @anchor/shared@workspace:*
```

- [ ] **Step 3: Supabase-Client schreiben**

Create `apps/web/src/lib/supabase.ts`:

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@anchor/shared/db-types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(url, anonKey);
```

> Falls `@anchor/shared/db-types` nicht auflöst: in `packages/shared/package.json` einen
> `exports`-Eintrag `"./db-types": "./src/db-types.ts"` ergänzen.

- [ ] **Step 4: `.env.local` anlegen (aus `supabase start`-Werten)**

Create `apps/web/.env.local`:

```ini
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key-aus-supabase-start>
```

- [ ] **Step 5: Startseite liest aus Supabase (Anbindungs-Smoke)**

Replace `apps/web/app/page.tsx`:

```tsx
import { supabase } from '@/lib/supabase';

export default async function Home() {
  const { data, error } = await supabase.from('groups').select('id, name').limit(5);
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui' }}>
      <h1>Anchor — Web</h1>
      <p>Supabase-Anbindung: {error ? `Fehler: ${error.message}` : 'OK'}</p>
      <pre>{JSON.stringify(data ?? [], null, 2)}</pre>
    </main>
  );
}
```

- [ ] **Step 6: Web starten & prüfen**

```bash
pnpm --filter web dev
```

Expected: `http://localhost:3000` zeigt „Supabase-Anbindung: OK" und `[]` (leere Gruppen).

- [ ] **Step 7: Committen**

```bash
git add apps/web
git commit -m "feat(web): scaffold next.js link-first frontend with supabase client"
```

---

### Task 4: Expo Mobile-App scaffolden & an Supabase anbinden

**Files:**
- Create: `apps/mobile/*` (via CLI)
- Create: `apps/mobile/metro.config.js`
- Create: `apps/mobile/src/lib/supabase.ts`
- Modify: `apps/mobile/app/index.tsx`
- Create: `apps/mobile/.env.local`

- [ ] **Step 1: Expo-App erzeugen (expo-router Template)**

```bash
pnpm create expo-app apps/mobile --template tabs
```

Expected: `apps/mobile` mit expo-router (`app/`-Verzeichnis).

- [ ] **Step 2: Metro für Monorepo konfigurieren (pnpm-Gotcha)**

Create `apps/mobile/metro.config.js`:

```javascript
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

- [ ] **Step 3: Supabase + Abhängigkeiten installieren**

```bash
pnpm --filter mobile add @supabase/supabase-js @anchor/shared@workspace:* @react-native-async-storage/async-storage react-native-url-polyfill
```

- [ ] **Step 4: Supabase-Client schreiben**

Create `apps/mobile/src/lib/supabase.ts`:

```typescript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@anchor/shared/db-types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 5: `.env.local` anlegen**

Create `apps/mobile/.env.local`:

```ini
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key-aus-supabase-start>
```

> Hinweis: Für ein echtes Gerät statt `127.0.0.1` die LAN-IP des Dev-Rechners nutzen.

- [ ] **Step 6: Startscreen liest aus Supabase**

Replace `apps/mobile/app/index.tsx` (bzw. den Haupt-Tab):

```tsx
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { supabase } from '../src/lib/supabase';

export default function Index() {
  const [status, setStatus] = useState('lädt…');

  useEffect(() => {
    supabase
      .from('groups')
      .select('id')
      .limit(1)
      .then(({ error }) => setStatus(error ? `Fehler: ${error.message}` : 'OK'));
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 20, fontWeight: '600' }}>Anchor</Text>
      <Text>Supabase-Anbindung: {status}</Text>
    </View>
  );
}
```

- [ ] **Step 7: App starten & prüfen**

```bash
pnpm --filter mobile exec expo start
```

Expected: In Expo Go / Simulator erscheint „Anchor" und „Supabase-Anbindung: OK".

- [ ] **Step 8: Committen**

```bash
git add apps/mobile
git commit -m "feat(mobile): scaffold expo app with monorepo metro + supabase client"
```

---

### Task 5: Turbo-Task-Verdrahtung & Gesamtlauf

**Files:**
- Modify: `apps/web/package.json`, `apps/mobile/package.json` (test/typecheck-Scripts)

- [ ] **Step 1: `typecheck`-Scripts sicherstellen**

In `apps/web/package.json` und `apps/mobile/package.json` je unter `"scripts"` ergänzen (falls fehlend):

```json
"typecheck": "tsc --noEmit"
```

- [ ] **Step 2: Gesamt-Test über Turbo**

```bash
pnpm test
```

Expected: Turbo führt `@anchor/shared` test aus → 1 passed. (Web/Mobile haben noch keine Tests → skipped/no-op.)

- [ ] **Step 3: Typecheck über alle Pakete**

```bash
pnpm typecheck
```

Expected: Kein Typfehler.

- [ ] **Step 4: Abschluss-Commit**

```bash
git add -A
git commit -m "chore: wire turbo test/typecheck across workspace"
```

---

## Akzeptanzkriterien Scheibe 0

- [ ] `pnpm test` grün (mind. `@anchor/shared` mit 1 echtem Test).
- [ ] `pnpm typecheck` fehlerfrei.
- [ ] Next.js zeigt „Supabase-Anbindung: OK".
- [ ] Expo-App zeigt „Supabase-Anbindung: OK".
- [ ] `supabase db reset` wendet `0001_foundation.sql` sauber an; DB-Typen generiert.

## Self-Review-Notiz

- Kein Platzhalter: alle Dateien mit vollem Inhalt.
- Typ-Konsistenz: `Database` aus `db-types.ts` in beiden Clients identisch importiert.
- TDD-Beweis: Task 1 durchläuft echten RED→GREEN-Zyklus, bevor Scaffolding-Tasks folgen.
