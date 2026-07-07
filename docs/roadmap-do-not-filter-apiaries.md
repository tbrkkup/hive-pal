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

### Phase 3 – Feinschliff
- Aggregierte Dashboard-Widgets im Alle-Modus (Todos/Timeline über Stände hinweg) – optional.
- Empty-States, Ladezustände, Query-Cache-Konsistenz über alle Seiten.

### Phase 4 – Tests (Playwright)
- E2E: Zwei Stände mit je Hives/Inspections; "Alle Bienenstände" zeigt beide (gruppiert),
  Umschalten filtert wieder. Cross-apiary Edit funktioniert; Create fragt Stand ab.
- Component-Test: ApiarySwitcher (Alle-Eintrag, Aktiv-State).
- Backend: Guard-Spec um `all`-Fälle (GET erlaubt, nicht-GET 400) erweitern.

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
