import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOMMELIER_PROMPT = `You are an expert Master Sommelier. Inspect this wine bottle label carefully and return ONLY a single valid JSON object with these exact keys:
{
  "producer": "Winery, producer, chateau, or domaine name (string)",
  "name": "Cuvee, vineyard, appellation, or varietal bottle name (string)",
  "vintage": 2021,
  "wine_type": "red",
  "region": "Primary wine region, e.g. Napa Valley, Bordeaux, Alentejo (string or null)",
  "sub_region": "Sub-region or village if applicable (string or null)",
  "country": "Country of origin, e.g. USA, France, Portugal, Italy (string or null)",
  "appellation": "Official appellation, e.g. AOC, DOCG, AVA, DOC (string or null)",
  "varietals": ["Grape 1", "Grape 2"],
  "abv": 13.5,
  "body": "Medium-Full",
  "tannin": "Medium",
  "acidity": "Medium",
  "sweetness": "Dry",
  "tasting_notes": ["Blackberry", "Plum", "Vanilla", "Spice"],
  "summary": "Concise 2-sentence sommelier overview of this wine, its producer, and style.",
  "food_pairings": ["Grilled steak", "Roast lamb", "Aged cheese"],
  "serving_temp": "60-65°F (15-18°C)",
  "decant_time": "30 minutes",
  "drinking_window": "2024-2029"
}`;

function findGeminiKey(): string | null {
  const candidates = [
    Deno.env.get("GEMINI_API_KEY"),
    Deno.env.get("EXPO_PUBLIC_GEMINI_API_KEY"),
    Deno.env.get("GOOGLE_API_KEY"),
    Deno.env.get("GEMINI_KEY"),
  ];
  for (const val of candidates) {
    if (val && val.trim()) {
      return val.trim().replace(/^["']|["']$/g, "");
    }
  }
  const envObj = Deno.env.toObject();
  for (const [k, v] of Object.entries(envObj)) {
    if (
      (k.toUpperCase().includes("GEMINI") || k.toUpperCase().includes("GOOGLE_API")) &&
      v &&
      v.trim()
    ) {
      return v.trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: `Unauthorized user: ${authError?.message || "no session"}` }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { imageBase64, mimeType = "image/jpeg" } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 is required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiApiKey = findGeminiKey();
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({
          error: "GEMINI_API_KEY secret not found in Edge Function environment.",
          code: "MISSING_GEMINI_KEY",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const modelsToTry = [
      "gemini-3.8-flash-lite",
      "gemini-3.8-flash",
      "gemini-flash-lite-latest",
      "gemini-flash-latest",
    ];
    let geminiJson: any = null;
    let lastErrorText = "";

    for (const modelName of modelsToTry) {
      try {
        const startMs = Date.now();
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(15000),
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: SOMMELIER_PROMPT },
                    {
                      inlineData: {
                        mimeType,
                        data: imageBase64,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0.2,
                responseMimeType: "application/json",
              },
            }),
          }
        );

        if (geminiRes.ok) {
          geminiJson = await geminiRes.json();
          console.log(`Model ${modelName} succeeded in ${Date.now() - startMs}ms`);
          break;
        } else {
          lastErrorText = await geminiRes.text();
          console.warn(
            `Model ${modelName} failed (${geminiRes.status}) in ${Date.now() - startMs}ms:`,
            lastErrorText.slice(0, 200)
          );
          if (lastErrorText.includes("API_KEY_INVALID") || geminiRes.status === 403) {
            break;
          }
        }
      } catch (fetchErr) {
        lastErrorText = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.warn(`Model ${modelName} timed out or network error:`, lastErrorText);
      }
    }

    if (!geminiJson) {
      let friendlyError = `Gemini API error: ${lastErrorText}`;
      try {
        const parsedErr = JSON.parse(lastErrorText);
        if (parsedErr?.error?.message) {
          friendlyError = `Gemini API: ${parsedErr.error.message}`;
        }
      } catch {
        // ignore
      }
      return new Response(JSON.stringify({ error: friendlyError }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return new Response(JSON.stringify({ error: "Could not parse wine label from image" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanedText = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleanedText);

    const producer = String(parsed.producer || "Unknown Producer").trim();
    const name = String(parsed.name || "Wine").trim();
    const vintage = typeof parsed.vintage === "number" ? parsed.vintage : null;
    const validTypes = ["red", "white", "rose", "sparkling", "dessert", "fortified", "orange"];
    const wineType = validTypes.includes(String(parsed.wine_type).toLowerCase())
      ? String(parsed.wine_type).toLowerCase()
      : "red";

    let query = supabase
      .from("wines")
      .select("*")
      .ilike("producer", producer)
      .ilike("name", name);

    if (vintage) {
      query = query.eq("vintage", vintage);
    } else {
      query = query.is("vintage", null);
    }

    const { data: existingWines } = await query.limit(1);
    if (existingWines && existingWines.length > 0) {
      return new Response(
        JSON.stringify({ wine: existingWines[0], cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: insertedWine, error: insertError } = await supabase
      .from("wines")
      .insert({
        producer,
        name,
        vintage,
        wine_type: wineType,
        region: parsed.region ?? null,
        sub_region: parsed.sub_region ?? null,
        country: parsed.country ?? null,
        appellation: parsed.appellation ?? null,
        varietals: Array.isArray(parsed.varietals) ? parsed.varietals : [],
        abv: typeof parsed.abv === "number" ? parsed.abv : null,
        body: parsed.body ?? null,
        tannin: parsed.tannin ?? null,
        acidity: parsed.acidity ?? null,
        sweetness: parsed.sweetness ?? null,
        tasting_notes: Array.isArray(parsed.tasting_notes) ? parsed.tasting_notes : [],
        summary: parsed.summary ?? null,
        food_pairings: Array.isArray(parsed.food_pairings) ? parsed.food_pairings : [],
        serving_temp: parsed.serving_temp ?? null,
        decant_time: parsed.decant_time ?? null,
        drinking_window: parsed.drinking_window ?? null,
        created_by: user.id,
      })
      .select("*")
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ wine: parsed, cached: false, warning: insertError.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ wine: insertedWine, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unhandled Edge Function exception:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
