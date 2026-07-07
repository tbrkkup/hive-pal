# Roadmap: Filtern nach Bienenständen deaktivierbar machen ("Alle Bienenstände"-Modus)

**Branch:** `claude/do-not-filter-apiaries-i0vic1`
**Ziel:** Das App-weite Filtern auf genau einen Bienenstand soll abschaltbar sein. Im
"Alle Bienenstände"-Modus zeigen Dashboard, `/hives`, `/inspections` und (iterativ) alle
weiteren Seiten die Objekte **aller** Stände des Users – auf dem Dashboard nach Stand
gruppiert, ähnlich wie BEEP.

Bestätigte Richtungsentscheidungen: **1a** (Eintrag "Alle Bienenstände" im Switcher),
**2a** (Schreiben kontextbezogen erlaubt), **3a** (iterativ, erst Kernseiten), **4a**
(Dashboard nach Stand gruppiert).

---

## Status & Verifikation

**Phase 1 abgeschlossen** (Dashboard, `/hives`, `/inspections`, Switcher, cross-apiary
Writes inkl. Inspektionen). **Phase 2a** (Todos, Queens, Harvests) **und Phase 2b/3b**
(Timeline-Endpoints Actions/Quick-Checks/Photos/Documents + verschachtelte Detail-Reads +
aggregierte Dashboard-Timeline) **abgeschlossen.**

| Prüfung | Ergebnis |
| --- | --- |
| Backend-/Frontend-Typecheck | ✅ |
| Frontend-Production-Build (inkl. SSR-Prerender) | ✅ |
| Backend-Unit-Tests (vitest) | ✅ 118 grün |
| Guard-Spec inkl. Alle-Modus-Fälle | ✅ |
| API-E2E (echte Postgres): Einzelstand / `all` / Cross-User-Isolation / Gating | ✅ |
| **Playwright-UI-E2E** (`view-all-apiaries.spec.ts`, `view-all-phase2.spec.ts`, `view-all-phase2b-timeline.spec.ts`) | ✅ **lokal grün** (3 Specs gegen Postgres + Prod-Build, mehrfach) |
| **Deploy-Test (Produktionsserver)** | ⏳ **offen – wird vom User später selbst durchgeführt** |

Belege (Playwright, echter Browser gegen Backend + Postgres):

| Zustand | Screenshot |
| --- | --- |
| Einzelstand „My Apiary" → nur dessen Hive | `docs/screenshots/view-all/01-single-apiary-filter.png` |
| „Alle Bienenstände" → `/hives` flache Liste über alle Stände | `docs/screenshots/view-all/02-all-apiaries-hives-flat.png` |
| Dashboard nach Stand gruppiert (BEEP-Stil) | `docs/screenshots/view-all/03-dashboard-grouped.png` |
| **Phase 2b/3b:** Einzelstand-Dashboard → Timeline nur „Checked Anna" | `docs/screenshots/view-all/p2b-01-single-apiary-timeline.png` |
| **Phase 2b/3b:** „Alle Bienenstände"-Dashboard → Timeline aggregiert „Anna" + „Boris" | `docs/screenshots/view-all/p3b-02-all-apiaries-timeline.png` |

Lokaler Testlauf (Referenz): Postgres via `/usr/lib/postgresql/16/bin` (kein Docker nötig),
Backend auf `:3000`, Prod-Build hinter einem kleinen Static-+`/api`-Proxy-Server auf `:5173`,
Playwright mit dem vorinstallierten Chromium (`/opt/pw-browsers/chromium-1194`).

---

## Ist-Zustand (wie das Filtern heute funktioniert)

1. **Store** `apps/frontend/src/hooks/use-apiary.ts`: `activeApiaryId` (genau ein Stand)
   in `localStorage` (`hive_pal_apiary_selection`). Kein "alle"-Zustand.
2. **Interceptor** `apps/frontend/src/api/client.ts`: hängt bei **jedem** Request den
   Header `x-apiary-id` aus dem localStorage an.
3. **Guard** `apps/backend/src/guards/apiary-context.guard.ts` (auf **19 Controllern**):
   **erzwingt** den Header, prüft Zugehörigkeit/Rolle, setzt `req.apiaryId` + `req.apiaryRole`.
4. **Services** filtern strikt nach diesem einen `apiaryId`.
5. **Query-Hooks** (`useHives`, `useInspections`, …): `enabled: !!activeApiaryId`.

Relevanter Fund: `HiveService.findAll` besitzt bereits einen (aktuell unerreichbaren)
Fallback "kein apiaryId → alle Stände des Users".

---

## Zielarchitektur

### Kernidee: "Alle"-Modus betrifft nur Lese-Requests (GET)
- **Lesen (GET):** Im Alle-Modus wird `x-apiary-id: all` gesendet. Guard erkennt das,
  setzt `req.allApiaries = true` (kein einzelner `apiaryId`). Services scopen auf
  owned + member Apiaries des Users.
- **Schreiben (POST/PATCH/DELETE):** senden immer einen **konkreten** `x-apiary-id`:
  - *Neu anlegen:* Ziel-Stand kommt aus dem Formular (Hive-Form hat schon einen Selector).
  - *Bestehendes ändern/löschen:* Ziel-Stand wird aus dem geladenen Objekt (`resource.apiaryId`)
    abgeleitet und als expliziter Header-Override mitgeschickt.
  - Guard verweigert `x-apiary-id: all` bei nicht-GET (klarer 400-Fehler).

Damit bleibt der 19-Controller-Guard fast unverändert; nur GET bekommt einen neuen Scope.

### Store-Modell (`use-apiary.ts`)
- `activeApiaryId: string | null` – **konkreter** Stand (Schreib-Ziel + Einzelansicht). Bleibt.
- `viewAllApiaries: boolean` – neu, persistiert (`hive_pal_view_all_apiaries`).
- Actions: `setActiveApiaryId` (setzt viewAll=false), `setViewAllApiaries(bool)`.
- `useApiary()` liefert zusätzlich `viewAllApiaries`.

### Interceptor (`api/client.ts`)
- Explizit vom Aufrufer gesetzter `x-apiary-id`-Header wird **nie** überschrieben (Override
  für cross-apiary Writes).
- Sonst: GET + viewAll → `'all'`; andernfalls konkreter `activeApiaryId` (heutiges Verhalten).

### Guard (`apiary-context.guard.ts`)
- `x-apiary-id === 'all'`:
  - nur GET erlaubt → `req.allApiaries = true`, `apiaryId` undefined, Rolle undefined.
  - nicht-GET → `BadRequestException` ("Konkreter Bienenstand für Schreibvorgänge nötig").
- sonst: unverändertes Einzelstand-Verhalten.
- `ApiaryPermissionGuard` erlaubt GET ohnehin für alle Rollen → keine Änderung nötig.

### Interface `request-with.apiary.ts`
- `apiaryId?: string` optional + `allApiaries?: boolean`.

---

## Phasenplan (iterativ)

### Phase 0 – Roadmap & Branch  ✅
- Branch `claude/do-not-filter-apiaries-i0vic1` von `main`, dieses Dokument.

### Phase 1 – Fundament + Kernseiten (Dashboard, /hives, /inspections)
**Backend**
- Guard: `all`-Keyword für GET, `req.allApiaries`.
- `request-with.apiary.ts`: Felder optional.
- `HiveController`/`HiveService.findAll`: Alle-Scope (Fallback aktivieren, `userId` scope).
- `InspectionsController`/`InspectionsService.findAll` (+ overdue/dueToday): Alle-Scope.

**Frontend**
- `use-apiary.ts`: `viewAllApiaries` + Actions.
- `api/client.ts`: Interceptor-Logik (Override respektieren, GET/all vs. konkret).
- Hooks `useHives`, `useHivesWithBoxes`, `useInspections`, `useOverdue-/useDueToday-`:
  `enabled` = `activeApiaryId || viewAllApiaries`; Scope-Token in Query-Key (single vs all).
- Write-Hooks (`useUpdateHive`, `useDeleteHive`, `useUpdateHiveBoxes`, inspection update/delete):
  optionaler `apiaryId`-Header-Override für cross-apiary Writes.
- `ApiarySwitcher`: Eintrag "Alle Bienenstände" (oben), Aktiv-Markierung, `invalidateQueries`.
- **Dashboard** (`home-page.tsx`): im Alle-Modus Hives **nach Stand gruppiert** (BEEP-Stil,
  Überschrift = Stand-Name + Icon). Einzelmodus unverändert. Apiary-spezifische Widgets
  (Minimap, Location-Nudge, ApiaryHeader) im Alle-Modus ausblenden/anpassen.
- `/hives` Listenseite: Alle-Modus zeigt alle (optional gruppiert).
- `/inspections` Listenseite: Alle-Modus zeigt alle (optional gruppiert).
- i18n: `apiary:switcher.allApiaries` in `en` + `de` (übrige Sprachen via Weblate).

**Test (Phase 1):** siehe Phase 4 – zuerst Kernseiten.

### Phase 2 – Weitere Lese-Seiten (iterativ, je nach Priorität)
Kalender, Reports, Harvests, Todos, Alerts, Queens, Measurements, Photos, Documents,
Actions, Quick-Checks, Assistant/Weather. Pro Endpoint: Service um Alle-Scope erweitern,
Hook `enabled`/Key anpassen, Seite ggf. gruppieren. Jede Seite einzeln abnehmen.

**Erledigt (Phase 2a):**
- **Todos** – `TodosService.findAll` Alle-Scope (`apiaryAccessWhere`), `@AllowAllApiaries`,
  `useTodos` Scope/enabled, Interceptor-Allowlist, `/todos` zeigt alle. Neuer geteilter
  Helper `common/apiary-scope.ts` (`apiaryAccessWhere`).
- **Queens** – `QueensService.findAll` Alle-Scope (inkl. Movement-Filter), `@AllowAllApiaries`,
  `useQueens` Scope-Key + Store-Anbindung, Interceptor-Allowlist.
- **Harvests** – bereits user-scoped mit optionalem `apiaryId`-Filter; im Alle-Modus lässt
  `harvest-list-page` den Filter weg (kein Backend-Change nötig).

Verifikation Phase 2a: API-E2E (echte Postgres) – Todo einzeln vs. `all` (Anna+Boris),
Queens `all` = 200, Todo-Write mit `all` = 400. Playwright grün & stabil
(`apps/e2e/tests/view-all-phase2.spec.ts`, 2× wiederholt).

| Zustand | Screenshot |
| --- | --- |
| Einzelstand „My Apiary" → nur „Todo Anna" | `docs/screenshots/view-all/p2-01-single-apiary-todos.png` |
| „Alle Bienenstände" → `/todos` über alle Stände | `docs/screenshots/view-all/p2-02-all-apiaries-todos.png` |

**Erledigt (Phase 2b — Timeline-Endpoints + verschachtelte Detail-Reads):**
- **Actions** – `ActionsService.findAll` Alle-Scope (`hive.apiary` → `apiaryAccessWhere`),
  `@AllowAllApiaries`, `useActions` Scope-Key + Store-Anbindung, Interceptor-Allowlist.
- **Quick-Checks** – `QuickChecksService.findAll`/`findOne`/`getPhotoDownloadUrl` Alle-Scope,
  `@AllowAllApiaries`, `useQuickChecks` Scope-Key, cross-apiary Delete (Header-Override).
- **Photos & Documents** – geteilter `FileUploadService.buildWhereClause`/`ownershipWhere`
  jetzt scope-fähig; `findAll`/`findOne`/`download-url` `@AllowAllApiaries`; `usePhotos`/
  `useDocuments` Scope-Key + expliziter Header-Pin bei gesetztem `apiaryId`-Filter;
  cross-apiary Delete (Header-Override).
- **Verschachtelte Detail-Reads** (lagen unter den bestehenden Allowlist-Prefixes `/api/hives`
  bzw. `/api/inspections` und bekamen dadurch bereits `x-apiary-id: all` → 400):
  `inspections/:id/photos`, `inspections/:id/audio` (+ AI-Status/-Result/-Download),
  `hives/:id/measurements` (+ `/latest`) sind jetzt `@AllowAllApiaries` und scopen im
  Alle-Modus auf die Stände des Users. Dadurch laden Inspektions-/Hive-Detailseiten eines
  Objekts aus einem *nicht-aktiven* Stand im Alle-Modus fehlerfrei.

Verifikation Phase 2b/3b: `apps/e2e/tests/view-all-phase2b-timeline.spec.ts` (echter Browser,
Postgres) — legt zwei Stände mit je einem Quick-Check an und prüft:
1. die Endpoints `/api/actions`, `/api/quick-checks`, `/api/photos`, `/api/documents`
   antworten mit `x-apiary-id: all` = **200**;
2. der verschachtelte Read `/api/hives/:id/measurements` (+ `/latest`) = **200** mit `all`;
3. Einzelstand-Dashboard zeigt nur den eigenen Quick-Check, „Alle Bienenstände" **beide**;
4. **kein** Timeline-Endpoint liefert beim Laden im Alle-Modus einen 4xx/5xx.

**Erledigt (Phase 2c — Kalender, Alerts, cross-apiary Writes):**
- **Kalender** – `CalendarService.getCalendarEvents` Alle-Scope (`hive.apiary` →
  `apiaryAccessWhere`), `@AllowAllApiaries`, `useCalendar` Scope-Key + `enabled` auf Scope,
  `/api/calendar` in der Interceptor-Allowlist. Dashboard-Kalender-Widget und `/calendar`
  aggregieren jetzt Termine über alle Stände. Die Sub-Routen mit Pfad-`apiaryId`
  (`apiary/:id/subscription`, `.../ical.ics`, `.../calendar-inspections`) nutzen **nur**
  `JwtAuthGuard` und ignorieren den `x-apiary-id`-Header → das `all` aus der Allowlist ist
  für sie harmlos.
- **Alerts** – `AlertsService.findAll`/`findOne` Alle-Scope, `@AllowAllApiaries`,
  `/api/alerts` in der Allowlist. Cross-apiary Writes: `dismiss`/`resolve` zielen über die
  Hive-`apiaryId` des Alerts auf dessen eigenen Stand (Header-Override), sodass ein Alert
  eines fremden Stands (Hive-Liste/Hive-Detail im Alle-Modus) korrekt quittiert wird.
- **Cross-apiary Writes**:
  - **Queen** create/update/transfer pinnen jetzt den Stand der Königin (aufgelöst über die
    Hive-`apiaryId` via `useHiveApiaryLookup`, Header-Override) — Bearbeiten/Transfer einer
    Königin eines fremden Stands im Alle-Modus funktioniert.
  - **Batch-Inspektion** create pinnt den im Formular gewählten Ziel-Stand
    (`data.apiaryId` als Header-Override).

Verifikation Phase 2c: der Endpoint-Probe-Teil von `view-all-phase2b-timeline.spec.ts` deckt
zusätzlich `/api/calendar` und `/api/alerts` mit `x-apiary-id: all` = **200** ab.

**Bewusst NICHT auf Alle-Modus umgestellt (naturgemäß Einzelstand):**
- **Reports** (`/api/reports/*`): berechnen Statistiken/Trends **für genau einen Stand**
  (Honigproduktion, Health-Scores, …). Die Reports-Seite wird immer mit einem konkreten
  `activeApiaryId` aufgerufen (im Alle-Modus weiterhin der Schreib-Ziel-Stand), und der
  Endpoint ist **nicht** in der Allowlist → bekommt nie `all`. Eine standübergreifende
  Summen-Auswertung wäre ein eigenständiges Feature (≈1000 Zeilen Aggregationslogik), kein
  Bugfix — daher offen gelassen.
- **Weather**: braucht die Koordinaten **eines** Stands; „alle Stände" hat keinen
  eindeutigen Ort. Bleibt am aktiven Stand.
- **Assistant**: Chat ist an den Stand seines Threads gebunden und sendet dessen `apiaryId`
  bereits explizit mit → keine Alle-Modus-Semantik nötig.

### Fehleranalyse & Behebungen (aus Review „analoge Fehler")

**Behoben:**
- **Persistenz des „Alle Bienenstände"-Modus über Sitzungen** (`use-apiary.ts`): Die
  Auswahl wird bereits seit Phase 1 in `localStorage` (`hive_pal_view_all_apiaries`)
  gehalten. Gehärtet gegen einen Race beim kalten Neustart: der Auto-Select-Effekt
  (der bei *null* Ständen `viewAll` abschaltet und sonst den ersten Stand als Schreib-Ziel
  setzt) läuft jetzt erst, wenn die Apiary-Query **definitiv geladen** ist
  (`isSuccess`) — ein transienter `undefined`/`[]`-Zwischenzustand während des Rehydrierens
  kann die persistierte Auswahl nicht mehr auf „erster Einzelstand" zurücksetzen.
  `localStorage`-Zugriffe zusätzlich SSR-sicher gekapselt. Regressionstest
  `apps/e2e/tests/view-all-persistence.spec.ts` (Reload **und** kalter Reopen mit geleertem
  Query-Cache → Switcher zeigt weiterhin „All apiaries", `localStorage` = `true`).
- **Detail-/History-Reads im Alle-Modus** (Korrektheitsfehler): Beim Öffnen einer
  Detailseite (Hive/Inspektion/Todo/Queen) eines Objekts aus einem *nicht-aktiven*
  Stand kam vorher **400** (`x-apiary-id: all` auf nicht-opt-in-Handler) bzw. **404**
  (Header = aktiver Stand ≠ Objekt-Stand). `findOne` + Queen-History-Endpoints sind jetzt
  `@AllowAllApiaries` und scopen auf die Stände des Users. Einzelstand-Isolation
  unverändert (falscher Stand → 404). Regressionstest im Hives-Spec (öffnet ein Hive aus
  Stand B im Alle-Modus).
- **`/todos`-Caption**: „…for all apiaries." im Alle-Modus (`todo:list.captionAll`).

**Behoben (Phase 2c):**
- **Cross-apiary WRITES außerhalb Hive/Inspektion**: Queen-Transfer/-Edit/-Create und
  Batch-Inspektion-Create pinnen jetzt den Ziel-/Objekt-Stand als Header-Override (siehe
  Phase 2c oben). Actions-Writes laufen über die Timeline-Deletes bzw. den Hive-Kontext.
- **Interceptor-Allowlist & Sub-Routen**: `/api/calendar` (und `/api/alerts`) sind in der
  Allowlist; ihre Sub-Routen mit eigenem Pfad-`apiaryId` (`/api/calendar/apiary/:id/...`)
  nutzen nur `JwtAuthGuard` und ignorieren den `x-apiary-id`-Header → das `all` ist für sie
  harmlos. `supportsViewAll` bleibt bei `startsWith`, da alle so erreichten GET-Handler
  entweder `@AllowAllApiaries` sind oder den Header ignorieren.

**Vorgeschlagen / noch offen (gleiche Klasse):**
- **Empty-State-Texte**: `onboarding` „Add your first hive to this apiary" (Dashboard-Empty
  im Alle-Modus, nur wenn 0 Hives gesamt) – niedrige Priorität, scope-abhängig formulieren.
  `hive:noHivesInApiary` betrifft nur die Stand-Detailseite (immer Einzelstand) → kein
  Alle-Modus-Problem.

### Phase 3 – Feinschliff  ✅ (Kern)
- **Todos aggregiert im Alle-Modus auf dem Dashboard**: `DashboardTodos` wird im Alle-Modus
  wieder eingeblendet (der Todos-Endpoint ist seit Phase 2a view-all-fähig) → zeigt offene
  Todos über alle Stände.
- **Timeline aggregiert im Alle-Modus (Phase 3b) ✅**: `ApiaryTimeline` wird auf dem
  Dashboard nicht mehr ausgeblendet. Im Alle-Modus lässt sie den `apiaryId`-Filter weg, sodass
  alle Endpoints (Inspections, Actions, Quick-Checks, Photos, Documents) via `x-apiary-id: all`
  über alle Stände aggregieren. Der Inline-„Add Entry"-Button (braucht einen konkreten Ziel-
  Stand) wird im Alle-Modus ausgeblendet; der Empty-State nutzt Alle-Modus-Wording
  (`timeline.noActivityAll`).
- **Scope-bewusster Empty-State**: Dashboard-„keine Hives" nutzt im Alle-Modus
  `empty.noHives.descriptionAll` („…any of your apiaries") statt „…this apiary".
- Query-Cache-Konsistenz: Scope-Token in allen betroffenen Query-Keys (Phase 1/2/2b) —
  single vs. `all` bleiben getrennt.

Offen (optional, später): aggregierter Dashboard-Header (Gesamt-Statistiken über Stände).

### Phase 4 – Tests (Playwright)
- E2E `view-all-apiaries.spec.ts`: Zwei Stände mit je Hives; "Alle Bienenstände" zeigt beide
  (Dashboard gruppiert, `/hives` flach), Umschalten filtert wieder; Öffnen eines Hives aus
  einem nicht-aktiven Stand im Alle-Modus (Detail-Read-Regression). ✅
- E2E `view-all-phase2.spec.ts`: Todos einzeln vs. „Alle Bienenstände"; Caption-Wechsel;
  Dashboard-Todo-Aggregation. ✅
- E2E `view-all-phase2b-timeline.spec.ts` (Phase 2b/3b): Endpoint-Opt-in (`all` = 200) für
  Actions/Quick-Checks/Photos/Documents + verschachtelte Measurements; aggregierte
  Dashboard-Timeline (einzeln vs. alle); keine 4xx/5xx im Alle-Modus. ✅
- Backend: Guard-Spec um `all`-Fälle (GET erlaubt, nicht-GET 400). ✅

**Lokaler Playwright-Runner (Referenz):** vorinstalliertes Chromium unter
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; die Repo-`playwright.config.ts` pinnt
keine `executablePath` (CI lädt Browser selbst). Für den lokalen Lauf wurde eine
Wegwerf-Config mit `use.launchOptions.executablePath` verwendet
(`BASE_URL=http://localhost:5173 npx playwright test view-all --config=<tmp>`).

### Phase 5 – Deploy-Test (durch den User)
- User deployt Branch auf Produktionsserver und verifiziert. Claude liefert alles davor.

---

## Risiken / offene Punkte
- **Query-Cache-Kollision**: Single- vs. Alle-Ergebnisse müssen unterschiedliche Keys haben
  (React-Query wird nach localStorage persistiert). In Phase 1 berücksichtigt.
- **Cross-apiary Writes**: brauchen den Header-Override; Objekte müssen ihren `apiaryId`
  kennen (tun sie in den Responses).
- **Apiary-spezifische Dashboard-Widgets** (Minimap etc.) haben im Alle-Modus keinen
  eindeutigen Stand → ausblenden/aggregieren.
- **VIEWER-Rollen** über mehrere Stände: Lesen ok; Schreiben pro Objekt-Stand geprüft.
