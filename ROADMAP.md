# Uncorked — Product Roadmap & Future Updates 🍷

This document tracks planned features, schema extensions, and agent upgrades for **Uncorked**.

---

## 1. Social & Friends ("Tasting Circle")
Turn Uncorked into a shared experience with friends while keeping personal cellars private by default.

### Planned Features
- **Profiles & Friendships**:
  - Add `public.profiles` (`id`, `username`, `display_name`, `avatar_url`, `favorite_styles`).
  - Add `public.friendships` (`requester_id`, `addressee_id`, `status: 'pending' | 'accepted'`).
- **Tasting Feed**:
  - See a chronological feed of bottles your friends have uncorked, their `0.0–5.0` ratings, and tasting notes.
- **"Drank Together" Tagging**:
  - Tag one or more friends when logging a bottle (`shared_with uuid[]` or `public.shared_tastings`).
  - Automatically prompts tagged friends to add their own rating and tasting notes to the exact same `wine_id` so you can compare scores side by side.
- **Send Bottle Recommendations**:
  - One-tap **"Recommend to a Friend"** on any bottle in your cellar.
  - Sends the wine + a personal note into your friend's **"Recommended by Friends / Wishlist"** tab.
- **Corky Multi-Palate Pairing (`get_friends_palates` tool)**:
  - Ask Corky: *"Jake and Sarah are coming over for pasta night—which bottle on my rack matches everyone's palate?"*
  - Corky cross-references your `bottles_on_hand > 0` with your friends' rating profiles.

---

## 2. Wishlist & Wine Shop Mode
- **Wishlist / "Want to Try" Status**:
  - Snap a bottle at a wine shop or restaurant without logging a tasting yet (`status: 'cellar' | 'wishlist'`).
- **Restaurant Wine Menu Scanner**:
  - Snap a photo of a printed restaurant wine list.
  - Corky reads all bottles + prices on the menu, compares them against your palate profile, and highlights the **Top 3 Best Value Matches** for your taste and meal.

---

## 3. Cellar Analytics & Drinking Window Alerts
- **Peak Drinking Window Tracker**:
  - Highlight bottles in your cellar (`bottles_on_hand > 0`) that are entering their ideal `drinking_window` vs. bottles meant for long-term aging.
- **Palate Dashboard**:
  - Visual breakdown of your most-logged regions, varietal radar chart, and best value-for-money bottles (`rating` vs. `price_paid`).

---

## 4. Native Release & Polish
- **Standalone Android `.apk` Build**:
  - Build via `eas build -p android --profile preview` (configured in `eas.json`) for standalone installation on Pixel.
- **OTA Updates**:
  - Configure `expo-updates` for instant JavaScript/UI updates over the air.
- **Hardware-Backed Token Storage**:
  - Optional migration from `AsyncStorage` to `expo-secure-store` for hardware-encrypted JWT storage on device.
