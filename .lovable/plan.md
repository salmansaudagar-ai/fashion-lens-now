
## Plan: Admin Panel + User Data Storage

Two distinct features to build:

### Feature 1 — Admin Panel (`/admin`)

The catalog currently lives in a hardcoded `src/data/catalog.ts` file. Moving it to the database allows live editing via an admin UI without code changes.

**Database changes:**
- New table `catalog_items` with columns: `id`, `name`, `category` (topwear/bottomwear/footwear), `image_url`, `color_variants` (jsonb), `is_active` (boolean), `sort_order` (int), `created_at`, `updated_at`
- Seed it with the existing 26 hardcoded items
- New table `admin_passwords` with a single hashed password row for simple admin auth (no full Supabase Auth needed — this is an in-store kiosk, just a passcode gate)
- RLS: `catalog_items` is publicly readable (anon SELECT), restricted write

**Admin UI — route `/admin`:**
- Simple passcode gate (4–6 digit PIN stored as a secret)
- Tabs: Topwear | Bottomwear | Footwear
- Product grid showing all items with thumbnail, name, active toggle
- "Add Product" button → opens a dialog with: Name, Category, Image URL (text field + preview), Color Variants (dynamic add/remove rows with name + hex picker), Active toggle
- Each card has Edit (pencil) and Delete (trash) icon buttons
- Delete shows a confirmation dialog before removing
- Edit opens the same dialog pre-filled

**Catalog source change:**
- `OutfitSelectionStep.tsx` and any other consumer of `getCatalogByCategory` switches to fetching from the `catalog_items` database table via a React Query hook
- `src/data/catalog.ts` stays as a fallback/seed reference but is no longer the live source

**Admin route protection:**
- `/admin` route added to `App.tsx`
- On load, checks `sessionStorage` for an admin token; if absent, shows a full-screen PIN entry modal
- PIN is stored as a Supabase secret `ADMIN_PIN` and validated via a simple edge function

---

### Feature 2 — User Data Capture for VTO Generations

Currently `vto_sessions` already stores sessions but the `full_name`, `email`, `phone`, and `gender` columns default to `"Guest"` / null. We need to capture real user data.

**Where to collect:** Add a lightweight "Your Details" form **after** the outfit selection try-on generation succeeds (Step 4 — the VirtualLookStep). After the generated image appears, show a soft CTA card: "Save your look — enter your details to receive it." Fields: Name, Email (optional), Phone (optional). Submitting updates the existing session record.

**New admin Users tab:**
- Add a "Users" tab to the admin panel
- Table view of all `vto_sessions` where `generated_look_url IS NOT NULL` (i.e. users who completed a generation)
- Columns: Name, Email, Phone, Generated Look (thumbnail), Date
- Export to CSV button

---

### Files to create / edit

```text
DATABASE
  migration: create catalog_items table + seed 26 items
  migration: add index on catalog_items(category)

NEW FILES
  src/pages/Admin.tsx               — admin shell + PIN gate
  src/components/admin/CatalogTab.tsx — product CRUD grid
  src/components/admin/UsersTab.tsx   — sessions/users table  
  src/components/admin/ProductDialog.tsx — add/edit form dialog
  src/hooks/useCatalog.ts           — React Query hook for DB catalog
  supabase/functions/validate-admin-pin/index.ts — PIN check edge function

EDITED FILES
  src/App.tsx                       — add /admin route
  src/components/vto/OutfitSelectionStep.tsx — use DB catalog via useCatalog hook
  src/components/vto/VirtualLookStep.tsx     — add user details capture form
  supabase/config.toml              — register validate-admin-pin function
```

---

### Admin UI structure

```text
/admin
├── [PIN Gate] — blocks access until correct PIN entered
└── [Tabs]
    ├── Topwear    → product cards grid + Add button
    ├── Bottomwear → product cards grid + Add button
    ├── Footwear   → product cards grid + Add button
    └── Users      → table of completed VTO sessions with export
```

### Security

- Catalog reads: public (anon) — needed for the kiosk
- Catalog writes (insert/update/delete): blocked by RLS, only allowed via the admin edge function or service role
- Admin PIN validation: edge function using service role, never exposes the PIN to the client
- Users data: admin panel reads via service role (edge function), not directly exposed to anon client
