# Uncorked

Uncorked is a wine journal that lives on my phone. I take a picture of a bottle's label, and the app works out what the wine is and fills in the details: producer, vintage, region, grapes, what it should taste like and what to eat with it. Then I add my own rating and notes, and it goes into my cellar.

I built it because I kept forgetting which bottles I liked. A notes app didn't cut it, and most wine apps want you to join a social network before they'll let you write anything down.

## What it does

**Scan a label.** Take a photo or pick one from your library. The photo gets shrunk and stripped of location data on the phone, then sent to Google's Gemini model, which reads the label and writes up a short profile of the wine. If someone has already scanned that same bottle, the app reuses the saved profile instead of asking Gemini again.

**Check it before saving.** The AI gets things wrong sometimes, especially with blurry photos or old labels. So nothing is saved until you've looked over the details and fixed anything that's off. Then you add your rating (0 to 5, or leave it unrated if you haven't opened it yet), what you paid, where you got it, how many bottles you have, and your own notes.

**Browse your cellar.** The home screen shows everything you've logged, with a few stats at the top: bottles logged, average score and your most common grape. You can search by producer, grape, region or anything you wrote in your notes.

**Ask Corky.** Corky is the built-in sommelier, a chat window that knows what's in your cellar. You can ask things like "what should I open with salmon tonight?" or "how does the Ridge compare to the Silver Oak?" Behind the scenes it can look up your taste profile, search your bottles, compare two wines side by side, and search the wider catalog of bottles other people have scanned. When you ask for a pairing, it starts with the bottles you have on hand. If none are marked, it picks from the bottles you've logged, so you get suggestions from your own collection instead of wines you don't own.

## How it's built

- **App:** React Native with Expo (SDK 58), written in TypeScript. Everything lives in `App.tsx` and `src/`.
- **Backend:** Supabase handles sign-in, the Postgres database and photo storage.
- **AI:** two Supabase Edge Functions call Gemini so the API key never touches the phone:
  - `analyze-wine-label` reads label photos
  - `corky-agent` runs the Corky chat and its tools

  Both try a few Gemini models in order, so one model being busy doesn't break the app.

### A note on security

I spent a good chunk of time locking this down, since it handles people's accounts and photos:

- Every table has row-level security, so you can only ever see your own logs, chats and photos.
- Bottle photos sit in a private storage bucket and are only shown through links that expire after an hour.
- The shared wine catalog can't be written to directly. New wines only get added through a database function that runs after you confirm a scan.
- AI use is rate-limited per person: 25 label scans and 40 Corky messages an hour. The limit is enforced in the database so it can't be skipped from the app.

The migrations in `supabase/migrations/` have the full history if you want the details.

## Running it yourself

You'll need Node, the [Supabase CLI](https://supabase.com/docs/guides/cli), a Supabase project, and a Gemini API key from [Google AI Studio](https://aistudio.google.com/). The free tier is plenty for one person.

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in your Supabase project URL and anon key.

3. Link your Supabase project and set up the database:

   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```

4. Give the Edge Functions your Gemini key, then deploy them:

   ```bash
   supabase secrets set GEMINI_API_KEY=<your-key>
   supabase functions deploy analyze-wine-label
   supabase functions deploy corky-agent
   ```

5. Start the app:

   ```bash
   npm start
   ```

   This opens an Expo tunnel. Scan the QR code with Expo Go on your phone. The tunnel means your phone doesn't need to be on the same network as your computer.

To check types without running anything, use `npm run typecheck`.

If you want a real Android app instead of going through Expo Go, `eas build -p android --profile preview` builds an `.apk` you can install directly.

## What's next

There's a lot I'd like to add: a way to share tastings with friends, a wishlist for bottles you want to try, a restaurant wine-list scanner, and alerts when a bottle in your cellar is ready to drink. It's all written up in [ROADMAP.md](ROADMAP.md).

Right now Uncorked is a personal project. It's not in the app stores, and I mostly use it on an Android phone.
