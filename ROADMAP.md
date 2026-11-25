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

#### UNC-005 — Corky multi-palate pairing

- **Status:** planned
- **Priority:** P3
- **Goal:** Ask Corky "Jake and Sarah are coming over for pasta night—which bottle on my rack matches
  everyone's palate?" and get an answer from your bottles on hand and your friends' ratings.

**Requirements:**
- A `get_friends_palates` tool that cross-references `bottles_on_hand > 0` with friends' rating profiles.

**Depends on:** UNC-001

**Done when:**
- Asking Corky for a bottle for named friends answers from bottles on hand that suit everyone's ratings.
- If a friend has no ratings yet, Corky says so instead of guessing.
- typecheck passes.

**Depends on:** profiles and friendships (parked in Future ideas)

### Corky actions and effortless bottle tracking

#### UNC-006 — Conversational bottle uncorking

- **Status:** done
- **Priority:** P3
- **Goal:** Tell Corky "Just finished that 2024 Saracosa, smooth with cherry notes, 4.4" (or send a photo of the
  empty bottle), and confirm a card that logs it.

**Requirements:**
- Corky finds the bottle with `search_user_cellar`.
- An in-chat confirmation card (`Confirm & Save` / `Cancel`) runs `public.uncork_bottle` atomically.
- The same confirmation cards for wishlist additions and quick stock changes.

**Out of scope:** Corky changing anything without a confirmation tap.

**Done when:**
- Telling Corky about a finished bottle (or sending a photo of it) shows a confirmation card for the right cellar bottle.
- Confirm & Save logs the tasting and lowers bottles on hand by one; Cancel changes nothing.
- typecheck passes.

#### UNC-007 — Morning-after check-in

- **Status:** planned
- **Priority:** P3
- **Goal:** When Corky recommends a cellar bottle for dinner, it asks next session whether you opened it, with
  one-tap answers (🍾 Yep, score it! / Still on the rack).

**Done when:**
- After Corky recommends a cellar bottle, the next session asks whether it was opened.
- 'Yep, score it!' opens the tasting sheet; 'Still on the rack' changes nothing.
- typecheck passes.

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

- **Status:** planned
- **Priority:** P3
- **Goal:** Photograph a restaurant wine list, and Corky highlights the top 3 best-value matches for your taste
  and meal.

**Requirements:**
- Reads every bottle and price on the menu and compares them with your palate profile.

**Done when:**
- A photo of a wine list returns up to 3 picks, each with its name, price and why it fits my palate and meal.
- A blurry or unreadable photo gets a clear 'couldn't read it' message.
- typecheck passes.

### Cellar analytics and drinking-window alerts

#### UNC-011 — Peak drinking window tracker

- **Status:** planned
- **Priority:** P3
- **Goal:** Highlight cellar bottles (`bottles_on_hand > 0`) entering their `drinking_window`, separately from
  bottles meant for long aging.

**Done when:**
- The cellar shows which bottles on hand are in, or entering, their drinking window.
- Bottles meant for long aging are listed separately.
- typecheck passes.

#### UNC-012 — Palate dashboard

- **Status:** planned
- **Priority:** P3
- **Goal:** A visual breakdown of your most-logged regions, a varietal radar chart, and best value-for-money
  bottles (`rating` vs. `price_paid`).

**Done when:**
- A palate screen shows my top regions, a varietal radar chart and my best value-for-money bottles.
- With only a few logged bottles it shows a friendly empty state, not an error.
- typecheck passes.

### Native release and polish

#### UNC-013 — Standalone Android `.apk`

- **Status:** planned
- **Priority:** P3
- **Goal:** Install Uncorked on the Pixel as a standalone app instead of through Expo Go.

**Requirements:**
- Built with `eas build -p android --profile preview` (configured in `eas.json`).

**Done when:**
- `eas build -p android --profile preview` produces an installable .apk.
- It installs and signs in on the Pixel without Expo Go.

#### UNC-014 — Over-the-air updates

- **Status:** planned
- **Priority:** P4
- **Goal:** JavaScript and UI updates reach the installed app without a rebuild.

**Requirements:**
- `expo-updates`.

**Depends on:** UNC-013

**Done when:**
- A JavaScript-only change, published as an update, reaches the installed app on its next launch without a rebuild.

## Future ideas

- **Profiles and friendships:** People can have a profile and add friends, while personal cellars stay private by default.
- **Tasting feed:** A chronological feed of the bottles your friends have uncorked, with their 0.0–5.0 ratings and tasting notes.
- **"Drank together" tagging:** Tag friends when logging a bottle, and prompt them to add their own rating and notes to the same wine so scores can be compared side by side.
- **Send bottle recommendations:** One-tap "Recommend to a Friend" on any bottle sends the wine and a personal note to the friend's "Recommended by Friends / Wishlist" tab.
- **Hardware-backed token storage:** Store the sign-in token with hardware encryption on the device.
