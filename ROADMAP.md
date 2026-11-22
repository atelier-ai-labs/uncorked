# Uncorked roadmap 🍷

**Last reviewed:** 2026-11-20. This file follows the Atelier AI Labs roadmap standard (v1.0).

## Vision

Uncorked is a wine journal on my phone. I photograph a label, the app works out the wine and fills in the
details, and I add my own rating and notes. Corky, the built-in sommelier, knows what's in my cellar. It started
because I kept forgetting which bottles I liked, and most wine apps want you to join a social network before
you can write anything down.

Where it's heading: a shared experience with friends (the "Tasting Circle") while personal cellars stay private
by default, a Corky that can take actions for me, and a real Android app. How it's built is in
[README.md](README.md).

## Current state

- Personal project, not in the app stores, used mostly on an Android phone through Expo Go.
- Working today: label scanning with Gemini (with a shared catalog so a bottle is only analyzed once), review
  before saving, the cellar with search and stats, and Corky chat with cellar tools.
- In Cellar / Tasted / Wishlist tabs, the one-tap Uncork tasting sheet and flavor tag chips shipped on
  2026-11-19 (c996d06).
- Security: row-level security on every table, private photos behind expiring links, catalog writes only
  through a confirmed database function, and per-person AI rate limits enforced in the database.
- `eas.json` has an Android preview profile; whether a standalone `.apk` has been built and installed is
  **(unverified)**.
- Next major objective: not decided yet. Nothing below is approved work until it's marked `planned`.

## Roadmap

Everything here came from the earlier roadmap's feature list. None of it had an order or "done when" checks,
so it's all `idea` for now. Mark an item `planned` (and add **Done when**) to approve it.

### Social & friends ("Tasting Circle")

#### UNC-001 — Profiles and friendships

- **Status:** idea
- **Priority:** P3
- **Goal:** People can have a profile and add friends, while personal cellars stay private by default.

**Requirements:**
- `public.profiles` (`id`, `username`, `display_name`, `avatar_url`, `favorite_styles`).
- `public.friendships` (`requester_id`, `addressee_id`, `status: 'pending' | 'accepted'`).

#### UNC-002 — Tasting feed

- **Status:** idea
- **Priority:** P3
- **Goal:** A chronological feed of the bottles your friends have uncorked, with their 0.0–5.0 ratings and
  tasting notes.

**Depends on:** UNC-001

#### UNC-003 — "Drank together" tagging

- **Status:** idea
- **Priority:** P3
- **Goal:** Tag friends when logging a bottle, and prompt them to add their own rating and notes to the same
  wine so scores can be compared side by side.

**Requirements:**
- `shared_with uuid[]` or a `public.shared_tastings` table.
- Tagged friends rate the exact same `wine_id`.

**Depends on:** UNC-001

#### UNC-004 — Send bottle recommendations

- **Status:** idea
- **Priority:** P3
- **Goal:** One-tap "Recommend to a Friend" on any bottle sends the wine and a personal note to the friend's
  "Recommended by Friends / Wishlist" tab.

**Depends on:** UNC-001

#### UNC-005 — Corky multi-palate pairing

- **Status:** idea
- **Priority:** P3
- **Goal:** Ask Corky "Jake and Sarah are coming over for pasta night—which bottle on my rack matches
  everyone's palate?" and get an answer from your bottles on hand and your friends' ratings.

**Requirements:**
- A `get_friends_palates` tool that cross-references `bottles_on_hand > 0` with friends' rating profiles.

**Depends on:** UNC-001

### Corky actions and effortless bottle tracking

#### UNC-006 — Conversational bottle uncorking

- **Status:** idea
- **Priority:** P3
- **Goal:** Tell Corky "Just finished that 2024 Saracosa, smooth with cherry notes, 4.4" (or send a photo of the
  empty bottle), and confirm a card that logs it.

**Requirements:**
- Corky finds the bottle with `search_user_cellar`.
- An in-chat confirmation card (`Confirm & Save` / `Cancel`) runs `public.uncork_bottle` atomically.
- The same confirmation cards for wishlist additions and quick stock changes.

**Out of scope:** Corky changing anything without a confirmation tap.

#### UNC-007 — Morning-after check-in

- **Status:** idea
- **Priority:** P3
- **Goal:** When Corky recommends a cellar bottle for dinner, it asks next session whether you opened it, with
  one-tap answers (🍾 Yep, score it! / Still on the rack).

#### UNC-008 — Clickable bottle cards in chat

- **Status:** done
- **Priority:** P3
- **Goal:** Corky's replies show interactive cellar bottle cards that open `WineDetailModal`.

**Done when:**
- Corky's replies mention a cellar bottle showing a tappable card (modal).
- All tests pass.

**References:** #6 (built by Verre's coding agent, work order #1, 2026-11-22)

### Wishlist and wine shop mode

#### UNC-009 — Wishlist / "Want to try" status

- **Status:** done
- **Priority:** P2
- **Goal:** Snap a bottle at a shop or restaurant without logging a tasting yet.

**Done when:**
- Bottles have a `cellar` / `tasted` / `wishlist` status, with In Cellar / Tasted / Wishlist tabs, a one-tap
  Uncork tasting sheet and flavor tag chips.

**References:** c996d06 (2026-11-19), `supabase/migrations/20261120002857_add_cellar_status_and_flavor_tags.sql`

#### UNC-010 — Restaurant wine menu scanner

- **Status:** idea
- **Priority:** P3
- **Goal:** Photograph a restaurant wine list, and Corky highlights the top 3 best-value matches for your taste
  and meal.

**Requirements:**
- Reads every bottle and price on the menu and compares them with your palate profile.

### Cellar analytics and drinking-window alerts

#### UNC-011 — Peak drinking window tracker

- **Status:** idea
- **Priority:** P3
- **Goal:** Highlight cellar bottles (`bottles_on_hand > 0`) entering their `drinking_window`, separately from
  bottles meant for long aging.

#### UNC-012 — Palate dashboard

- **Status:** idea
- **Priority:** P3
- **Goal:** A visual breakdown of your most-logged regions, a varietal radar chart, and best value-for-money
  bottles (`rating` vs. `price_paid`).

### Native release and polish

#### UNC-013 — Standalone Android `.apk`

- **Status:** idea
- **Priority:** P3
- **Goal:** Install Uncorked on the Pixel as a standalone app instead of through Expo Go.

**Requirements:**
- Built with `eas build -p android --profile preview` (configured in `eas.json`).

#### UNC-014 — Over-the-air updates

- **Status:** idea
- **Priority:** P4
- **Goal:** JavaScript and UI updates reach the installed app without a rebuild.

**Requirements:**
- `expo-updates`.

**Depends on:** UNC-013

#### UNC-015 — Hardware-backed token storage

- **Status:** idea
- **Priority:** P4
- **Goal:** Store the sign-in token with hardware encryption on the device.

**Requirements:**
- Optional move from `AsyncStorage` to `expo-secure-store`.

## Future ideas

None beyond the items above yet.
