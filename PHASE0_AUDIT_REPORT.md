# PHASE 0 — AUDIT TECHNIQUE COMPLET — DocuFlow

**Date d'audit** : 27 Février 2026
**Auditeur** : Claude Code (Opus 4.6)
**Branche** : `claude/clarify-project-scope-0DMnK`

---

## 0️⃣ Résumé Exécutif

| Champ | Valeur |
|-------|--------|
| **Nom du projet** | DocuFlow |
| **Objectif produit actuel** | Plateforme tout-en-un de documentation, gestion de projet et CRM avec éditeur bloc (type Notion), time tracking, screenshots, recherche IA sémantique et chatbot assistant |
| **Stack principale** | React 18 + TypeScript / Express.js + Drizzle ORM / PostgreSQL (Neon) + pgvector / Google Cloud Storage / OpenAI API |
| **Environnement de déploiement** | Replit (autoscale) — Port 5000 → 80 |
| **Vision cible** | Web App + Desktop Agent comparable à Time Doctor |

---

## 1️⃣ Architecture Frontend

### 1.1 Stack

| Composant | Technologie | Version |
|-----------|------------|---------|
| **Framework** | React | 18.3.1 |
| **State Management** | TanStack React Query (server state) + Context API (time tracking) + localStorage (UI prefs) |
| **Routing** | Wouter | 3.3.5 |
| **Styling** | Tailwind CSS + shadcn/ui (Radix UI) | 3.4.17 |
| **Build Tool** | Vite | 5.4.20 |
| **Rich Text Editor** | TipTap | 3.11.1 |
| **Forms** | React Hook Form + Zod | 7.55.0 / 3.24.2 |
| **Animation** | Framer Motion | 11.13.1 |
| **TypeScript** | Strict mode | 5.6.3 |

**Fichiers clés** :
- `vite.config.ts` — Config build (root: `client/`, output: `dist/public/`)
- `client/src/lib/queryClient.ts` — React Query config (`staleTime: Infinity`, `refetchOnWindowFocus: false`)
- `client/src/App.tsx` — Layout principal avec `TimeTrackerProvider`

### 1.2 Time Tracking Architecture

#### Où est stocké l'activeTimeEntry ?

| Aspect | Emplacement | Fichier:Ligne |
|--------|------------|---------------|
| **Query serveur** | React Query cache | `TimeTrackerContext.tsx:88-91` — `useQuery` avec polling 10s |
| **Ref synchronisée** | `activeEntryRef` (useRef) | `TimeTrackerContext.tsx:85, 151-153` |
| **Projet sélectionné** | State local + sync depuis `activeEntry` | `TimeTrackerContext.tsx:66, 158` |
| **Durée affichée** | Calculée (entry.duration + elapsed) | `TimeTrackerContext.tsx:156-180` |

#### Le timer est-il global ?

**OUI — Timer GLOBAL et SINGLETON.**
- Un seul `TimeTrackerProvider` englobe tout le layout authentifié (`App.tsx:38-61`)
- Une seule entrée active par utilisateur (enforced côté backend)
- Tous les composants partagent la même instance du contexte

#### Sidebar et TimeTrackingPage partagent-ils le même state ?

**Partiellement :**
- **Sidebar** (`AppSidebar.tsx:240`) : utilise `<TimeTracker iconOnly={true} />` → accède au contexte via `useTimeTracker()`
- **TimeTrackingPage** (`TimeTrackingPage.tsx:85-115`) : utilise ses propres queries React Query (lecture seule, PAS de `useTimeTracker()`)
- Synchronisation via invalidation de query keys communes

```
┌─────────────────────────────────────────┐
│  TimeTrackerProvider (Context.tsx)      │
│  ├─ activeEntry (from Query)           │
│  ├─ displayDuration (calculated)       │
│  ├─ isRunning, isPaused, etc.         │
│  └─ Action handlers (start/stop/etc)   │
└────────────┬──────────────────────────┘
             │
    ┌────────┴─────────┬──────────────────────┐
    │                  │                      │
┌───▼────────┐  ┌──────▼───────┐      ┌──────▼──────────┐
│ TimeTracker │  │ AppSidebar   │      │ TimeTrackingPage │
│ Component   │  │ (IconOnly)   │      │                  │
└─────────────┘  └──────────────┘      └──────────────────┘
  useTimeTracker() useTimeTracker()       Queries indépendantes
```

#### Où est déclenché startTimer ?

| Déclencheur | Fichier | Ligne |
|-------------|---------|-------|
| Bouton UI "Start Tracking" | `TimeTracker.tsx` | 181-188 |
| Handler contexte | `TimeTrackerContext.tsx` | 496-500 (`handleStart`) |
| Mutation API | `TimeTrackerContext.tsx` | 106-114 (`POST /api/time-tracking/start`) |

#### Où est déclenché stopTimer ?

| Déclencheur | Fichier | Ligne |
|-------------|---------|-------|
| Bouton UI "Stop" | `TimeTracker.tsx` | 269-278 |
| Handler contexte | `TimeTrackerContext.tsx` | 514-518 (`handleStop`) |
| **Auto-stop (idle)** | `TimeTrackerContext.tsx` | 257-273 (countdown 30s → `stopMutation`) |
| "No, stop timer" (dialog) | `TimeTrackerContext.tsx` | 296-305 (`handleNotWorking`) |
| Mutation API | `TimeTrackerContext.tsx` | 130-139 (`POST /api/time-tracking/{id}/stop`) |

#### Idle detection est géré où ?

**Implémentation principale** : `client/src/contexts/TimeTrackerContext.tsx:182-282`
- Événements surveillés : `mousemove`, `keydown`, `mousedown`, `touchstart`, `scroll`, `wheel`
- Seuil d'inactivité : **180 secondes (3 min)**
- Intervalle de vérification : **5 secondes**
- Heartbeat serveur : **60 secondes**
- Countdown d'avertissement : **30 secondes**

**Note** : Un hook dupliqué existe dans `hooks/useActivityDetection.ts` mais n'est **PAS utilisé**.

#### Screenshot hook est attaché où ?

**Tout dans** `TimeTrackerContext.tsx:307-493` :
- `startScreenCapture()` : `getDisplayMedia()` → démarrage stream (ligne 435-460)
- `captureFrame()` : canvas → JPEG blob → upload GCS (ligne 312-423)
- `scheduleNextCapture()` : `setTimeout` randomisé 3-5 min (ligne 425-433)
- `stopScreenCapture()` : arrêt stream + cleanup (ligne 462-477)
- Toggle via `handleToggleCapture()` (ligne 520-526)

---

## 2️⃣ Backend Architecture

### 2.1 Stack Backend

| Composant | Technologie | Version |
|-----------|------------|---------|
| **Framework** | Express.js | 4.21.2 |
| **ORM** | Drizzle ORM | 0.39.1 |
| **DB** | PostgreSQL (Neon Serverless) + pgvector | — |
| **Auth** | Dual : Email/password (bcrypt) + Replit OIDC (Passport.js) | — |
| **Object Storage** | Google Cloud Storage (Replit sidecar) | — |
| **AI** | OpenAI API (embeddings + chat) | 6.9.1 |
| **Email** | Resend | 4.0.0 |

**Fichiers clés** :
- `server/index.ts` — Bootstrap Express (126 lignes)
- `server/routes.ts` — 100+ endpoints REST (~4000 lignes)
- `server/storage.ts` — Data Access Layer, pattern Repository (80+ méthodes)
- `server/auth.ts` — Auth Passport.js + OIDC (238 lignes)
- `server/db.ts` — Connexion Neon WebSocket
- `server/objectStorage.ts` — Intégration GCS (299 lignes)
- `shared/schema.ts` — Schéma Drizzle complet
- `drizzle.config.ts` — Config migrations

### 2.2 Time Tracking Data Model

#### Table `time_entries`

```
Column              | Type        | Constraints
====================|=============|==========================================
id                  | VARCHAR     | PK, DEFAULT: gen_random_uuid()
userId              | VARCHAR     | NOT NULL, FK → users.id (CASCADE)
crmProjectId        | VARCHAR     | NOT NULL, FK → crmProjects.id (CASCADE)
description         | TEXT        | NULL
startTime           | TIMESTAMP   | NOT NULL
endTime             | TIMESTAMP   | NULL
duration            | INTEGER     | DEFAULT: 0 (secondes hors idle)
idleTime            | INTEGER     | DEFAULT: 0 (secondes idle)
status              | VARCHAR(20) | NOT NULL, DEFAULT: "running"
                    |             | ENUM: ["running", "paused", "stopped"]
lastActivityAt      | TIMESTAMP   | NULL (pour idle detection)
createdAt           | TIMESTAMP   | DEFAULT: now()
updatedAt           | TIMESTAMP   | DEFAULT: now()

INDEXES:
- idx_time_entries_user (userId)
- idx_time_entries_crm_project (crmProjectId)
- idx_time_entries_status (status)
- idx_time_entries_start (startTime)
```

#### Table `time_entry_screenshots`

```
Column          | Type         | Constraints
================|==============|==========================================
id              | VARCHAR      | PK, DEFAULT: gen_random_uuid()
timeEntryId     | VARCHAR      | NOT NULL, FK → timeEntries.id (CASCADE)
userId          | VARCHAR      | NOT NULL, FK → users.id (CASCADE)
crmProjectId    | VARCHAR      | NOT NULL, FK → crmProjects.id (CASCADE)
storageKey      | VARCHAR(500) | NOT NULL (chemin GCS)
capturedAt      | TIMESTAMP    | NOT NULL, DEFAULT: now()
createdAt       | TIMESTAMP    | DEFAULT: now()

INDEXES:
- idx_screenshots_time_entry (timeEntryId)
- idx_screenshots_user (userId)
- idx_screenshots_project (crmProjectId)
- idx_screenshots_captured (capturedAt)
```

#### Diagramme relationnel

```
users
  ├─→ timeEntries (1:N via userId)
  │    ├─→ crmProjects (N:1 via crmProjectId)
  │    │    ├─→ projects (N:1 via projectId)
  │    │    └─→ crmClients (N:1 via clientId)
  │    └─→ timeEntryScreenshots (1:N via timeEntryId)
  ├─→ projects (1:N via ownerId)
  ├─→ crmClients (1:N via ownerId)
  ├─→ teams (1:N via ownerId)
  └─→ notifications (1:N via userId)

timeEntryScreenshots
  ├─→ timeEntries (N:1 via timeEntryId)
  ├─→ users (N:1 via userId) [dénormalisé pour accès direct]
  └─→ crmProjects (N:1 via crmProjectId) [dénormalisé]
```

#### Cycle de vie d'un Time Entry

```
  [CREATE] POST /start
       ↓
    "running" ←─── POST /resume
       │                ↑
       ↓                │
  POST /pause      POST /resume
       ↓                ↑
    "paused" ───────────┘
       │
       ↓
  POST /stop (ou auto-stop idle)
       ↓
    "stopped"
```

#### Stratégie d'isolation utilisateur

```typescript
// Non-admin : uniquement ses propres entrées
if (user?.role !== "admin") {
  filters.userId = userId;
}
// Admin : peut filtrer par userId via query param
```

#### Risques de scalabilité identifiés

1. **Problème N+1** : `getTimeEntries()` fait des sous-requêtes par entrée (user, crmProject, project, client)
2. **Agrégation en mémoire** : `getTimeStats()` charge TOUT en mémoire avant de grouper
3. **Pas de transactions** sur les opérations de time tracking
4. **Pas d'index composite** `(userId, status, startTime DESC)`
5. **Idle detection client-side uniquement** : pas de timeout serveur si le client ne répond plus

---

## 3️⃣ Security & Auth Layer

### Comment l'utilisateur est authentifié ?

**Dual Auth System** — Fichier : `server/auth.ts`

1. **Email/Password** (Session-based)
   - Hachage bcrypt (12 salt rounds)
   - Sessions PostgreSQL via `connect-pg-simple`
   - TTL session : 7 jours
   - Cookies : `httpOnly: true`, `secure: true (prod)`, `sameSite: "lax"`

2. **Replit OIDC** (OAuth OpenID Connect)
   - Provider : `https://replit.com/oidc`
   - Scopes : `openid email profile offline_access`
   - Refresh token automatique

3. **API Key** (MCP)
   - Header `X-API-Key` comparé à `MCP_API_KEY`
   - Octroie accès admin complet

### Session-based ? JWT ?

**Session-based** uniquement. Pas de JWT.
- Stockage : PostgreSQL (`sessions` table)
- Secret : `SESSION_SECRET` (env var obligatoire)
- Régénération de session à la connexion (anti-fixation)

### Rôles ?

| Rôle | Droits |
|------|--------|
| `user` | Accès à toutes les données de l'entreprise (projets, docs, CRM), mais time entries limitées aux siennes |
| `admin` | Tout accès + gestion utilisateurs + voir toutes les time entries |
| `isMainAdmin` | Admin protégé (ne peut pas être modifié/supprimé) |

### Multi-tenant support ?

**NON — Single-tenant avec accès company-wide.**

⚠️ **FINDING CRITIQUE** : Tous les utilisateurs authentifiés accèdent à TOUTES les données :
- Tous les projets et documents
- Tous les clients et contacts CRM
- Tous les documents d'entreprise
- **Exception** : les time entries sont isolées par utilisateur

### Authorization checks ?

```
Route protection flow:
1. isAuthenticated middleware → vérifie API key OU session OU OIDC
2. getUserId() → extrait l'ID utilisateur de la session
3. Per-route checks → vérifie ownership ou role admin
4. isAdmin middleware → pour routes /api/admin/*
```

### Vulnérabilités identifiées

| # | Vulnérabilité | Sévérité | Emplacement |
|---|--------------|----------|-------------|
| 1 | **MCP_API_KEY en clair** dans `.replit` | CRITIQUE | `.replit:51` |
| 2 | **Accès company-wide** (pas d'isolation per-user) | HAUTE | `storage.ts` (getProjects, getCrmClients) |
| 3 | **Pas de rate limiting** | HAUTE | `server/index.ts` |
| 4 | **Pas de security headers** (helmet.js manquant) | MOYENNE | `server/index.ts` |
| 5 | **Pas de CORS** configuré | MOYENNE | Manquant |
| 6 | **Pas de CSRF token** (seulement SameSite cookie) | MOYENNE | `server/auth.ts` |
| 7 | **Pas de lockout** après échecs de login | BASSE | `server/routes.ts` |

### Points positifs

- ✅ Bcrypt (12 rounds) pour les mots de passe
- ✅ Protection SQL injection via Drizzle ORM
- ✅ Validation Zod sur toutes les entrées
- ✅ Session regeneration (anti-fixation)
- ✅ Cookies httpOnly + secure + sameSite
- ✅ Isolation des time entries par utilisateur

---

## 4️⃣ Screenshot System (Web Version)

### getDisplayMedia usage

**Fichier** : `client/src/contexts/TimeTrackerContext.tsx:441-443`

```typescript
const stream = await navigator.mediaDevices.getDisplayMedia({
  video: { width: { ideal: 1280 }, height: { ideal: 720 } },
  audio: false,
});
```

- Résolution : 1280x720 (idéale)
- Audio : désactivé
- Détection fin de stream : événement `ended` sur le video track (ligne 449)

### Upload flow

```
1. captureFrame() → canvas.toBlob("image/jpeg", 0.7)
        ↓
2. POST /api/time-tracking/screenshots/upload-url
   → Retourne signed URL GCS (TTL: 15 min)
        ↓
3. PUT {signedURL} avec le blob JPEG
        ↓
4. POST /api/time-tracking/screenshots
   → Sauvegarde metadata en base (storageKey normalisé)
```

### Signed URL lifetime

**900 secondes (15 minutes)** — `objectStorage.ts:136`

### Error handling

| Scénario | Comportement | Fichier:Ligne |
|----------|-------------|---------------|
| Permission refusée | Erreur affichée, pas de retry | `TimeTrackerContext.tsx:455-459` |
| Stream terminé | Auto-stop capture | `TimeTrackerContext.tsx:449-451` |
| Track non-live | Stop capture | `TimeTrackerContext.tsx:323-328` |
| Video pas ready | Polling requestAnimationFrame + timeout 3s | `TimeTrackerContext.tsx:340-353` |
| Blob trop petit (<1KB) | Skip frame | `TimeTrackerContext.tsx:374-377` |
| Upload échoué | Compteur +1, retry au prochain interval | `TimeTrackerContext.tsx:411-422` |
| 5 échecs consécutifs | **ARRÊT total** de la capture | `TimeTrackerContext.tsx:415-418` |

### Stream lifecycle handling

- **Création** : `startScreenCapture()` → `getDisplayMedia()` (ligne 435-460)
- **Stockage** : `streamRef` (useRef)
- **Scheduling** : `setTimeout` randomisé 180-300s (3-5 min)
- **Cleanup** : `stopScreenCapture()` → stop tracks + nullify refs + clear timers (ligne 462-477)
- **Unmount** : useEffect cleanup (ligne 491-493)

### Risques mémoire

| Risque | Niveau | Détail |
|--------|--------|--------|
| Canvas non détruit | BAS-MOYEN | Créé par capture, GC-dépendant |
| Video element | TRÈS BAS | Réutilisé (ref unique) |
| MediaStream tracks | TRÈS BAS | Properly stopped dans cleanup |
| Blobs en transit | BAS | Libérés après fetch() |

### Fichiers orphelins GCS

⚠️ **Quand un screenshot est supprimé en base, le fichier GCS reste.** Pas de cleanup automatique.

---

## 5️⃣ Idle Detection System

### Mécanisme de détection

| Paramètre | Valeur | Fichier:Ligne |
|-----------|--------|---------------|
| **Seuil d'inactivité** | 180 secondes (3 min) | `TimeTrackerContext.tsx:61` |
| **Intervalle vérification** | 5 000 ms | `TimeTrackerContext.tsx:228` |
| **Heartbeat serveur** | 60 secondes | `TimeTrackerContext.tsx:62` |
| **Countdown warning** | 30 secondes | `TimeTrackerContext.tsx:63` |
| **Événements surveillés** | mousemove, keydown, mousedown, touchstart, scroll, wheel | `TimeTrackerContext.tsx:210` |
| **Event passive** | `{ passive: true }` | `TimeTrackerContext.tsx:212` |

### Stockage des timeouts

| Timer | Type | Ref |
|-------|------|-----|
| Heartbeat | `setInterval` (60s) | `heartbeatIntervalRef` |
| Idle check | `setInterval` (5s) | `idleCheckIntervalRef` |
| Countdown | `setInterval` (1s) | `idleCountdownRef` |
| Activité | `Date.now()` dans ref | `lastActivityRef` |

### Nettoyage des timers

- ✅ Cleanup dans la fonction de retour de useEffect
- ✅ Cleanup explicite dans `handleStillWorking` et `handleNotWorking`
- ✅ Cleanup au unmount du provider

### Backend sync on auto-pause

**Auto-STOP, PAS auto-pause.**
- Idle détecté → dialog affiché → 30s countdown
- Si pas de réponse → `stopMutation.mutate(entry.id)` → `POST /api/time-tracking/:id/stop`
- L'entrée passe en status `"stopped"` (pas `"paused"`)

### Race condition risks

| Risque | Niveau | Détail |
|--------|--------|--------|
| **Multi-tabs** | CRITIQUE | Pas de synchronisation entre onglets (pas de BroadcastChannel/SharedWorker) |
| **Tab backgrounded** | HAUTE | Pas de listener `visibilitychange` — idle detection continue en background |
| **Start/stop concurrent** | MOYEN | Backend rejette avec 400 si déjà stopped, mais pas gracieux |
| **System sleep/wake** | MOYEN | Timers gelés pendant sleep, idle faussement détecté au réveil |
| **Debounce** | BAS | Pas de debounce sur les events (mousemove 60+ fps) mais ref update seulement |

### Bug identifié

⚠️ `TimeTracker.tsx:193` vérifie `status === "idle"` mais le schéma n'autorise que `["running", "paused", "stopped"]`. Cette condition ne peut jamais être vraie.

---

## 6️⃣ Deployment & Infrastructure

### Current DB hosting

**Neon Serverless PostgreSQL** — Connexion WebSocket
- Driver : `@neondatabase/serverless`
- Connection pooling géré par Neon
- Connexion : `DATABASE_URL` (env var)

### Object storage provider

**Google Cloud Storage** via Replit sidecar
- Endpoint sidecar : `http://127.0.0.1:1106`
- Auth : Replit OAuth2 token exchange
- Signed URLs : 15 min TTL

### Secrets handling

| Variable | Statut |
|----------|--------|
| `DATABASE_URL` | ✅ Env var |
| `SESSION_SECRET` | ✅ Env var (obligatoire) |
| `OPENAI_API_KEY` | ✅ Env var |
| `FATHOM_API_KEY` | ✅ Env var (optionnel) |
| `MCP_API_KEY` | ⚠️ **EN CLAIR dans `.replit`** |

### CI/CD

**AUCUN CI/CD automatisé.**
- Pas de `.github/workflows/`
- Pas de tests automatisés
- Déploiement : push → Replit auto-build → auto-deploy

### Environment separation (dev/prod)

| Environnement | Configuration |
|---------------|--------------|
| **Dev** | `npm run dev` (Vite HMR) |
| **Prod** | `npm run build` + `npm start` (bundled) |
| **Staging** | ❌ Non configuré |
| **DB** | ⚠️ Base unique pour tout |

### Build process

```
npm run build
  ├─ Vite → dist/public/ (React static files)
  └─ ESBuild → dist/index.cjs (Express bundle minifié)

npm start
  └─ NODE_ENV=production node dist/index.cjs
```

### Scalabilité

| Aspect | Statut |
|--------|--------|
| Horizontal scaling | ✅ Replit autoscale |
| Background jobs | ❌ Pas de queue (Bull/RabbitMQ) |
| Caching | ❌ Pas de Redis |
| Read replicas | ❌ Non configuré |
| Health checks | ❌ Pas d'endpoint `/health` |
| Monitoring | ❌ Console.log uniquement |

### Production readiness gaps

| Gap | Sévérité |
|-----|----------|
| Pas d'error tracking (Sentry) | CRITIQUE |
| Pas de CI/CD automatisé | HAUTE |
| Logs console-only (pas persistés) | HAUTE |
| Base unique dev/prod | MOYENNE |
| Pas de rate limiting | MOYENNE |
| Pas de backups documentés | MOYENNE |
| Pas de compression (gzip) | BASSE |
| Pas de graceful shutdown | BASSE |

---

## 7️⃣ Technical Debt & Risk Assessment

### Architecture fragility level : **MOYENNE-HAUTE** ⚠️

| Zone | Fragilité | Détail |
|------|-----------|--------|
| **Time Tracking Frontend** | HAUTE | Race conditions polling/mutation, pas de WebSocket, closures stale, mémoire |
| **Idle Detection** | HAUTE | Pas de multi-tab, pas de visibilitychange, bug status "idle" |
| **Screenshot System** | MOYENNE | Canvas GC-dépendant, arrêt brutal après 5 échecs, fichiers orphelins GCS |
| **Backend API** | MOYENNE | N+1 queries, agrégation en mémoire, pas de transactions |
| **Auth/Security** | HAUTE | API key en clair, company-wide access, pas de rate limiting |
| **Data Model** | BASSE | Bien structuré, FK correctes, indexes appropriés |

### Scalability readiness : **FAIBLE** ⚠️

- ✅ Autoscale Replit (horizontal)
- ❌ Pas de job queue pour tâches longues (embeddings, transcripts)
- ❌ Pas de caching (Redis)
- ❌ N+1 queries sur le time tracking
- ❌ Single DB sans read replicas
- Estimation : **100-500 utilisateurs concurrents** max en l'état

### Monitoring readiness : **TRÈS FAIBLE** ❌

- ❌ Pas d'error tracking (Sentry/Rollbar)
- ❌ Pas d'APM (New Relic/DataDog)
- ❌ Pas de health checks
- ❌ Pas d'alerting
- ✅ Logs console avec timestamps et durées

### Agent integration difficulty : **MOYENNE** 🔶

**Points favorables pour intégrer un Desktop Agent :**
- ✅ API REST bien structurée et documentée
- ✅ Endpoints time tracking complets (start/pause/resume/stop/activity)
- ✅ Signed URLs pour upload screenshots
- ✅ Auth par API key existante (MCP)
- ✅ Schéma DB extensible

**Points bloquants :**
- ⚠️ Idle detection client-only (besoin de logique serveur pour l'agent)
- ⚠️ Screenshot upload lié à getDisplayMedia (web-only, Desktop Agent différent)
- ⚠️ Pas de WebSocket pour sync temps réel
- ⚠️ Rate limiting manquant (un agent peut surcharger l'API)
- ⚠️ Pas de heartbeat serveur-side (si agent crash, pas de détection)

### Estimated refactor required : **MOYEN (2-4 semaines)**

| Priorité | Refactor | Effort |
|----------|----------|--------|
| P0 | Rate limiting + security headers | 2h |
| P0 | Retirer MCP_API_KEY du .replit | 30min |
| P1 | WebSocket pour sync temps réel | 2-3j |
| P1 | Server-side idle timeout | 1-2j |
| P1 | API v2 pour Desktop Agent | 3-5j |
| P2 | Job queue (Bull) pour embeddings | 2-3j |
| P2 | Fix N+1 queries | 1-2j |
| P2 | Multi-tab BroadcastChannel | 1j |
| P3 | Health checks + monitoring | 1j |
| P3 | CI/CD pipeline | 2-3j |
| P3 | Environnement staging | 1j |

---

## Diagramme d'Architecture Complet

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT (React 18 + Vite)                 │
│                                                             │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ AppSidebar│  │ TimeTrackerCtx   │  │ TimeTrackingPage │  │
│  │ (iconOnly)│  │ ┌─────────────┐  │  │ (read-only)     │  │
│  │           │  │ │ Idle Detect  │  │  │                 │  │
│  │           │  │ │ Screenshot   │  │  │                 │  │
│  │           │  │ │ Timer Logic  │  │  │                 │  │
│  │           │  │ └─────────────┘  │  │                 │  │
│  └────┬──────┘  └───────┬──────────┘  └────────┬────────┘  │
│       │                 │                      │            │
│       └─────────┬───────┘                      │            │
│           useTimeTracker()               React Query        │
│                 │                              │            │
└─────────────────┼──────────────────────────────┼────────────┘
                  │            HTTP/REST          │
                  ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    SERVER (Express.js)                       │
│                                                             │
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ Auth      │  │ Time Tracking    │  │ CRM / Docs /     │  │
│  │ Passport  │  │ Routes           │  │ Search / Chat    │  │
│  │ Sessions  │  │ /start /stop     │  │ Routes           │  │
│  │ API Keys  │  │ /pause /resume   │  │                  │  │
│  └────┬──────┘  │ /activity        │  └────────┬─────────┘  │
│       │         │ /screenshots     │           │            │
│       │         └───────┬──────────┘           │            │
│       │                 │                      │            │
│       └────────┬────────┴──────────────────────┘            │
│                │                                            │
│         ┌──────▼──────────────┐                             │
│         │ DatabaseStorage     │                             │
│         │ (Drizzle ORM)       │                             │
│         └──────┬──────────────┘                             │
└────────────────┼────────────────────────────────────────────┘
                 │
      ┌──────────┼──────────────┐
      ▼          ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ Neon DB  │ │ GCS      │ │ OpenAI   │
│ Postgres │ │ Storage  │ │ API      │
│ pgvector │ │ (Replit) │ │ GPT/Emb  │
└──────────┘ └──────────┘ └──────────┘
```

---

## Constantes de Configuration Clés

| Constante | Valeur | Emplacement |
|-----------|--------|-------------|
| `IDLE_TIMEOUT_SECONDS` | 180 | `TimeTrackerContext.tsx:61` |
| `HEARTBEAT_INTERVAL_SECONDS` | 60 | `TimeTrackerContext.tsx:62` |
| `IDLE_COUNTDOWN_SECONDS` | 30 | `TimeTrackerContext.tsx:63` |
| Idle Check Interval | 5000 ms | `TimeTrackerContext.tsx:228` |
| Screenshot Interval | 180-300s (random) | `TimeTrackerContext.tsx:309` |
| Signed URL TTL | 900s (15 min) | `objectStorage.ts:136` |
| Session TTL | 7 jours | `auth.ts:30` |
| Bcrypt Salt Rounds | 12 | `auth.ts:11` |
| JPEG Quality | 0.7 (70%) | `TimeTrackerContext.tsx:372` |
| Max Capture Failures | 5 | `TimeTrackerContext.tsx:415` |
| Query Refetch Interval | 10s | `TimeTrackerContext.tsx:90` |
| JSON Payload Limit | 10 MB | `server/index.ts:19` |

---

## Recommandations Prioritaires pour Desktop Agent

### Immédiat (avant Agent)
1. **Sécuriser l'API Key** — Retirer du `.replit`, utiliser Replit Secrets
2. **Rate limiting** — `express-rate-limit` sur tous les endpoints
3. **Security headers** — Ajouter `helmet.js`
4. **Server-side idle timeout** — Ne pas dépendre uniquement du client
5. **Health check endpoint** — `GET /health`

### Court terme (avec Agent)
6. **WebSocket** pour sync temps réel (timer, screenshots)
7. **API v2 Desktop Agent** avec auth token dédié
8. **Server-side heartbeat monitoring** — Détecter agent crash
9. **Screenshot upload adapté** (pas de getDisplayMedia pour Desktop)
10. **Fix bug status "idle"** dans `TimeTracker.tsx:193`

### Moyen terme (stabilisation)
11. **Job queue** (Bull/BullMQ) pour embeddings et transcripts
12. **Fix N+1 queries** dans `getTimeEntries()`
13. **BroadcastChannel** pour multi-tab
14. **CI/CD pipeline** avec tests
15. **Environnement staging**

---

*Rapport généré automatiquement par Claude Code — Audit complet du projet DocuFlow*
