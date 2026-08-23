# Handoff-Prompt für die nächste Session

Kopiere den folgenden Block als erste Nachricht in eine neue Claude-Code-Session
(im Ordner `C:\Users\KEK\Documents\MCP\Projekte\Idee`):

---

Wir setzen ein Konzept fort, das wir in einer vorherigen Session ausgearbeitet haben.

**Kontext:** Ich baue eine B2C-App für Freundesgruppen. Positionierung: „Die App, die verhindert,
dass deine Freundesgruppe auseinanderdriftet." Der MVP-Einstieg ist der Anwendungsfall
**„Der Trip, der endlich stattfindet"**.

**Bitte lies zuerst die komplette Design-Spec:**
`docs/superpowers/specs/2026-08-23-freundes-trip-app-design.md`
Dort stehen Vision, MVP-Scope, Architektur, Datenmodell, Nudge-Engine, Tech-Stack (Expo/React Native
+ Next.js, TypeScript), Monetarisierung und das Entscheidungs-Log.

**v1-Scope (bereits festgelegt, bitte nicht wieder aufmachen):**
Nudge/Kickoff → Link-first Zusagen → Termin-Lock (FOMO + Deadline + Auto-Lock) →
Unterkunfts-Kürung (Links droppen + voten, affiliate-ready) → Kostenaufteilung (Splitwise-Style,
kein Geldfluss durch die App).

**Was ich in dieser Session erreichen will (in dieser Reihenfolge):**
1. Kurzer Reality-Check der Spec: offene Punkte aus §11 durchgehen (v. a. Metadaten-Parsing der
   Unterkunfts-Links — Scraping vs. offizielle API/oEmbed) und ggf. Naming vorschlagen.
2. Einen detaillierten **Implementierungsplan** für den v1-Scope erstellen
   (nutze den `writing-plans`-Skill). Wichtig: als vertikale Scheiben schneiden, mit
   „Termin-Lock" als erster lauffähiger Scheibe.
3. Danach: Expo-Projekt + Backend (Supabase) scaffolden.

Fang mit Schritt 1 an und stimm den Plan mit mir ab, bevor Code entsteht.

---
