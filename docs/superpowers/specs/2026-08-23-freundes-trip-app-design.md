# Design-Spec: Freundesgruppen-App — MVP „Der Trip, der endlich stattfindet"

**Datum:** 2026-08-23
**Status:** Konzept freigegeben (Brainstorming abgeschlossen), bereit für Implementierungsplan
**Arbeitstitel:** „Reunite" / „Crew" (Naming noch offen)

---

## 1. Vision & Positionierung

> **Die App, die verhindert, dass deine Freundesgruppe auseinanderdriftet.**

**Kern-Insight:** In WhatsApp scrollt alles Wichtige weg und stirbt. Diese App ist der Ort, wo die
Gruppe *lebt* und Pläne *nicht* im Sand verlaufen. Der Einstieg erfolgt über den schmerzhaftesten,
konkretesten Fall: den gemeinsamen Trip.

**Langfrist-Vision (nicht v1):** Ein persistentes „Zuhause" für jede Freundesgruppe, das alles
zusammenhält (Termine, Unterkunft, Kosten, Docs, Fotos) und die Gruppe proaktiv wachhält. Der Trip
ist der Türöffner in diese Vision.

## 2. Zielgruppe & Viraler Motor

- **Wer:** Freundesgruppen ~25–40, die sich „eigentlich" regelmäßig treffen/verreisen wollen, es aber
  regelmäßig nicht schaffen.
- **Viral eingebaut:** Ein Trip zwingt die ganze Gruppe rein (Netzwerkeffekt). Link-first → keine
  Hürde beim ersten „Ja".
- **Verteilung:** über Freundeskreis & Kollegen + Social Media (v. a. TikTok).
- **TikTok-Hook:** *„POV: Eure Clique plant seit 3 Jahren einen Trip — so haben wir ihn endlich
  hinbekommen."*

## 3. Der Kern-Flow (v1)

```
Nudge/Kickoff  →  Zusagen (Link)  →  Termin-Lock  →  Unterkunft küren  →  Kosten teilen
```

1. **Nudge/Kickoff:** Die App stupst die Gruppe an („Es wird mal wieder Zeit…") ODER jemand startet
   manuell. Löst das Problem „keiner fängt an".
2. **Zusagen (Link-first):** Freunde klicken einen Link, sagen im Browser zu und geben Verfügbarkeit
   an — **ohne Download**.
3. **Termin-Lock:** Sichtbares, verbindliches Commitment („7/10 dabei" → FOMO), harte Deadline,
   Auto-Lock. Wenn kein Termin für *alle* passt → App schlägt den **best-besuchten** Termin vor
   statt zu scheitern.
4. **Unterkunft küren:** Alle droppen AirBnB-/Booking-Links, App zieht Metadaten (Titel/Bild/Preis),
   alle voten, eine gewinnt. **Affiliate-ready** aufgebaut.
5. **Kosten teilen:** Splitwise-Style Buchhaltung — wer hat was bezahlt, wer schuldet wem. Ausgleich
   erfolgt **außerhalb** der App (z. B. PayPal-Deeplink). **Es fließt kein Geld durch die App.**

## 4. Architektur — Komponenten (je eine klare Aufgabe)

| Komponente | Aufgabe |
|---|---|
| **Group Service** | Dauerhafte Gruppen: anlegen, Mitglieder verwalten, Invite-Links |
| **Trip Service** | Trip-Lebenszyklus: Entwurf → Terminfindung → gelockt → Unterkunft → aktiv → fertig |
| **Commitment-Modul** | Terminfindung, die aus „könnte" ein verbindliches „komme" macht (Deadline, Auto-Lock) |
| **Accommodation-Modul** | Link-Shortlist + Voting + Metadaten-Parsing (affiliate-ready) |
| **Cost-Splitting-Modul** | Ausgaben-Ledger, Saldenberechnung, Settle-up-Deeplinks |
| **Nudge-Engine** *(die Seele)* | Überwacht Inaktivität + Trip-Status, feuert Push zum richtigen Moment |
| **Notification Service** | Expo-Push für App-Nutzer, Mail/SMS-Fallback für Link-Gäste |
| **Web-Link-Frontend** | Schlank: beitreten, zusagen, voten — ohne Download; upsellt die App |

**Design-Prinzip:** Jede Komponente hat eine klare Aufgabe, kommuniziert über definierte Schnittstellen
und ist isoliert testbar.

## 5. Datenmodell (Skizze)

- `User` — App-Nutzer
- `LinkGuest` — Link-only-Teilnehmer (später zu `User` konvertierbar)
- `Group` — id, name, members[], inviteToken, createdAt, lastActivityAt
- `Membership` — User/Guest ↔ Group, Rolle
- `Trip` — id, groupId, title, status, destination?, dateWindowOptions[], lockedDate?, deadline
- `DateCommitment` — tripId, participant, availability + commitment-Flag
- `AccommodationOption` — tripId, url, parsedMeta, votes[]
- `Expense` — tripId, payer, amount, currency, splitAmong[], description
- `Balance` — abgeleitet aus Expenses
- `NudgeEvent` — Log der versendeten Nudges (gegen Nudge-Fatigue)

## 6. Die Nudge-Engine (die Seele)

**Trigger:**
- Gruppe X Wochen still → *„Zeit für was Gemeinsames?"*
- Trip gestartet → andere einladen
- Deadline naht → *„Noch 24h — 6/10 sind schon dabei"*
- Termin gelockt → *„🎉 Offiziell: 14.–16. März. Jetzt Unterkunft finden."*
- Unterkunft entschieden → *„Termin & Ort stehen!"*
- Nach dem Trip → *„Fotos & Kosten teilen"*

**⚠️ Haupt-Risiko: Nudge-Fatigue.** Lieber zu selten als zu oft — sonst muten Nutzer die App und die
Seele stirbt. Frequenz-Capping über `NudgeEvent`-Log.

## 7. Fehlerbehandlung & Edge Cases

- Kein Termin für alle → best-besuchten Termin vorschlagen („mit dabei: 8/10")
- Link-Gast antwortet nicht → Mail-Nudge; Deadline lockt trotzdem
- Kaputter/ungültiger Unterkunfts-Link → Fallback: nur URL anzeigen
- Aussteiger nach Zusage → Teilnehmerliste + Salden neu berechnen, Gruppe benachrichtigen
- Kosten mit Nicht-App-Gästen → als reine Namen erfassbar

## 8. Tech-Stack

- **Mobile:** Expo / React Native (iOS + Android), TypeScript
- **Web:** schlankes Next.js-Frontend für den Link-first-Flow
- **Backend:** Supabase (oder Node) für Daten + Auth + Push-Anbindung
- **Push:** Expo Push Notifications; Mail/SMS als Fallback für Link-Gäste
- **Begründung:** passt zum TypeScript-Stack des Nutzers, ein Codebase für iOS+Android, sauberes
  Push (die Seele funktioniert richtig — anders als bei PWA auf iOS).

## 9. Monetarisierung (Roadmap)

1. **v1:** gratis, aber **affiliate-ready** gebaut (Unterkunfts-Flow so strukturiert, dass später
   Buchungs-/Affiliate-Links reinpassen). Noch kein Umsatz.
2. **Phase 2:** Affiliate scharf schalten, sobald Reichweite da ist (Booking/AirBnB-Provisionen auf
   Gruppenreisen = hohe Buchungswerte, Peak-Kaufabsicht).
3. **Später:** Freemium-Abo für Power-Features (dauerhaftes Archiv, unbegrenzte Trips, erweiterte
   Kosten).

## 10. Bewusst NICHT in v1 (Scope-Disziplin)

- Echte Zahlungsabwicklung / Anzahlungen (Geld bewegen)
- Täglicher Gruppen-Chat (bleibt in WhatsApp; evtl. Deeplink)
- Dauerhaftes Foto-/Doc-Archiv (v1.1)
- Flüge / Aktivitäten buchen
- Automatik für wiederkehrende (jährliche) Trips (v1.1)

## 11. Offene Punkte / Risiken

- **Naming** noch offen (Arbeitstitel „Reunite"/„Crew").
- **Cold-Start:** die ersten Gruppen gewinnen (Freundeskreis als Beta).
- **Nudge-Fatigue** (siehe §6) — sorgfältiges Tuning nötig.
- **Wettbewerb:** Splitwise/Partiful könnten expandieren.
- **Metadaten-Parsing** von AirBnB/Booking-Links: rechtlich/technisch prüfen (Scraping vs. offizielle
  APIs/oEmbed).

## 12. Entscheidungs-Log (aus dem Brainstorming)

| Frage | Entscheidung |
|---|---|
| Ausgangspunkt | Zielgruppe „Leute wie ich" + offen; B2C, halbberuflich |
| Herz der App | Der „Haltet-euch-warm"-Motor (Nudge) — nicht bloßes Planungstool |
| Wedge / MVP | „Der Trip, der endlich stattfindet" |
| Todes-Punkt der Trips | Kickoff (1) + Terminfindung (2); Unterkunfts-Suche sekundär |
| Commitment-Level | **Mittel** — sozial sichtbar + Deadline + Auto-Lock, kein Geld |
| Eingangstür | **Hybrid** — Link-first Web + App für Zuhause & Push |
| v1-Scope | Termin-Lock + Unterkunfts-Kürung + Kostenaufteilung |
| Kosten | **Buchhaltung** (Splitwise-Style), kein Geldfluss durch die App |
| Monetarisierung | Affiliate-ready, gestaffelt (Affiliate → später Abo) |
| Tech | Expo/React Native + Next.js Web, TypeScript |

## 13. Nächste Schritte

1. (Optional) Naming + kurzer Wettbewerbs-Sanity-Check.
2. **Implementierungsplan** erstellen (`writing-plans`-Skill) für den v1-Scope.
3. Expo-Projekt + Backend scaffolden, dann vertikale Scheibe „Termin-Lock" zuerst bauen.
