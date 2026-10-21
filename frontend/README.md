# FloodSense — Next.js 15 Multimodal UI

Autonomous aerial flood-intelligence platform combining fine-tuned **SegFormer (10-Class)** segmentation, **ChromaDB disaster protocol retrieval**, and **grounded SITREP synthesis**.

---

## 🎨 Art Direction & Design System

- **Reference:** Editorial documentary aesthetic (*awwwards "Deferred Damage"*).
- **Palette:**
  - Deep Abyss Teal: `#04161A` (Primary canvas)
  - Mid Teal: `#0E3B43` (Surfaces, panels, hairline dividers)
  - Silt / Sand Off-White: `#E9E4D8` (Primary typography)
  - Warning Accent: Rust / Amber `#D9822B` (**strictly reserved for flood severity scores**)
- **Typography:**
  - Serif: `Fraunces` (Editorial headlines)
  - Grotesk: `Inter Tight` / `Geist` (UI elements and field labels)
  - Monospace: `JetBrains Mono` (Telemetry data, citations, timestamps)
- **Hard Anti-AI Rules:**
  - ❌ No purple/blue neon glows or glassmorphic gradient blobs.
  - ❌ No sparkle icons (`✨`), robot avatars, or "supercharge" marketing copy.
  - ✔️ Field report language: calm, precise, actionable.
  - ✔️ Assistant titled **"Analyst"** with a small teal tick mark.

---

## 🚀 Key Functional Intelligence

1. **Live Mask Reveal:** Scan line sweep animation across aerial imagery; opacity slider and before/after wipe comparison.
2. **Severity Tide Gauge:** Vertical water-level gauge rising to the computed hazard tier.
3. **Ask the Image:** Click any region on the segmentation mask to attach spatial coordinates and class context directly into the query composer.
4. **Streaming SITREP & Statutory Drawer:** Inline citation tags (`[[NDMA-SOP-4.2]]`) open an interactive side drawer with the exact protocol excerpt.
5. **Timeline Compare Mode:** Dual-upload slider calculating inundation area expansion delta.
6. **Command Palette (`Cmd/Ctrl + K`):** Rapid keyboard-driven incident navigation and exports.
7. **Image-derived 2.5D relief:** In the Studio simulator, run a backend segmentation on a sample or uploaded image and render its overlay and class mask as an orbitable relief. The class offsets are illustrative only; one image cannot provide true 3D geometry, metric elevation, or hidden surfaces.

---

## 🛠️ Getting Started

### 1. Install Dependencies
```bash
cd frontend
npm install
```

### 2. Configure Environment Variables
Copy `.env.local.example` to `.env.local`:
```bash
cp .env.local.example .env.local
```
Fill in your Supabase project credentials and backend API URL (`http://localhost:5050`).

### 3. Apply Supabase Database Migrations
Copy and run the contents of [`supabase/migrations/001_initial_schema.sql`](file:///c:/Users/varshitha-home/Downloads/flood%202/flood/frontend/supabase/migrations/001_initial_schema.sql) in your Supabase SQL Editor:
- Creates `profiles`, `chat_threads`, `chat_messages`, `published_reports` tables.
- Sets up Row-Level Security (RLS) policies ensuring users only view their own private data.
- Configures the `flood-imagery` storage bucket for UAV photos.

### 4. Run the Development Server
Start the Flask backend from the repository root in a separate terminal. Use the project virtual environment so PyTorch and torchvision stay matched:
```bash
USE_TF=0 .venv/bin/python dashboard/server.py
```

Then start the frontend:
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.
The chat analysis and API playground send requests to the configured Flask
backend; inference errors are shown instead of substituting demo predictions.

---

## 🗂️ Project File Structure

```
frontend/
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql    # Tables, RLS policies, Storage buckets
├── src/
│   ├── app/
│   │   ├── globals.css               # Editorial tokens, caustics, film grain
│   │   ├── layout.tsx                # Root layout with editorial font links
│   │   ├── page.tsx                  # Landing page (editorial scroll story)
│   │   ├── login/page.tsx            # Split-screen operator sign in
│   │   ├── signup/page.tsx           # Unit registration
│   │   ├── onboarding/page.tsx       # Personalized role, region, tone setup
│   │   └── app/
│   │       ├── layout.tsx            # App shell with timeline sidebar & Cmd+K
│   │       ├── page.tsx              # Workspace entry redirect
│   │       ├── chat/[id]/page.tsx    # Multimodal dual-pane chat & SITREP
│   │       ├── gallery/page.tsx      # Archival image history (masonry & map)
│   │       ├── settings/page.tsx     # Operator profile, units, data purge
│   │       └── community/page.tsx    # Anonymized public field reports feed
│   ├── components/
│   │   ├── MaskViewer.tsx            # Live reveal, opacity, wipe, Ask the Image
│   │   ├── TideGauge.tsx             # Signature vertical rising water gauge
│   │   ├── CitationDrawer.tsx        # Slide-in statutory protocol drawer
│   │   ├── DamageTable.tsx           # 10-Class FloodNet distribution table
│   │   ├── CompareSlider.tsx         # Before/after flood progression slider
│   │   ├── CommandPalette.tsx        # Cmd+K navigation & quick action modal
│   │   └── SitrepStream.tsx          # Editorial analyst SITREP renderer
│   └── lib/
│       ├── types.ts                  # Shared TypeScript interfaces
│       ├── mock-data.ts              # Typed realistic field incident datasets
│       └── supabase.ts               # Supabase & backend API client
├── tailwind.config.ts                # Deep abyss teal & silt sand tokens
├── next.config.mjs
├── tsconfig.json
└── package.json
```
