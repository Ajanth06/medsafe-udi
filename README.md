# MedSafe-UDI

Dezentrale UDI- und Dokumentenverwaltung für Medizinprodukte (MDR/ISO 13485).

## Stack

- **Next.js 16** (App Router)
- **React 19** + TypeScript
- **Supabase** (Auth, PostgreSQL, Storage)
- **Tailwind CSS 4**
- **OpenAI** (KI-Assistent, optional)

## Module

| Route | Funktion |
|-------|----------|
| `/` | UDI-Dashboard, Geräteverwaltung, KI-Assistent |
| `/docs` | Dokumentenmodul mit Pflichtdokument-Matrix |
| `/batches` | Chargen- und Serienübersicht |
| `/audit-log` | Zentrales Audit-Log mit Filter und CSV-Export |
| `/risk-analysis` | ISO 14971 Risikoanalyse (FMEA, Fishbone) |

## Setup

### 1. Abhängigkeiten

```bash
npm install
```

### 2. Umgebungsvariablen

```bash
cp .env.example .env.local
```

Trage Supabase-URL, Anon Key und Service Role Key ein.

### 3. Supabase-Datenbank

Im Supabase SQL Editor ausführen (Reihenfolge):

1. `supabase/schema.sql` — Basis-Tabellen + RLS
2. `supabase/mdr_device_fields.sql`
3. `supabase/mdr_naming_alignment.sql`
4. `supabase/docs_module.sql`
5. `supabase/product_udi_registry.sql`
6. `supabase/soft_delete.sql`
7. `supabase/risk_analysis.sql`

Storage-Buckets anlegen: `docs`, `documents`

### 4. Admin-Benutzer

```bash
npm run create-admin -- admin@example.com sicheres-passwort
```

### 5. Entwicklungsserver

```bash
npm run dev
```

> Hinweis: `--webpack` ist gesetzt, weil Turbopack auf externen Laufwerken Probleme machen kann.

## Sicherheit

- Geschützte Routen via `middleware.ts` (Session-Cookie erforderlich)
- API-Routen (`/api/upload`, `/api/ai`, `/api/qms-documents`, `/api/docs/open`) erfordern Authentifizierung
- Row Level Security (RLS) pro Benutzer in `supabase/schema.sql`

## Projektstruktur

```
app/           # Next.js Seiten und API-Routen
lib/           # Supabase-Clients, Auth, Hilfsfunktionen
types/         # Gemeinsame TypeScript-Typen
utils/         # FMEA-Berechnungen
supabase/      # SQL-Migrationen
scripts/       # Admin-CLI
```
