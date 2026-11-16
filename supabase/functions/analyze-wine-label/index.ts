import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_BASE64_LENGTH = 4_000_000; // ~3 MB max image payload
const MAX_SCANS_PER_HOUR = 25;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
    const upper = k.trim().toUpperCase();
    if (
      !upper.startsWith("SUPABASE_") &&
      !upper.startsWith("DENO_") &&
      (upper.includes("GEMINI") ||
        upper.includes("GOOGLE") ||
        upper.includes("AIZA") ||
        v.trim().startsWith("AIza")) &&
      v &&
      v.trim()
    ) {
      return v.trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

function sanitizeText(val: unknown, maxLen: number): string | null {
  if (typeof val !== "string") return null;
  const cleaned = val.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLen);
}

function sanitizeArray(val: unknown, maxItems = 15, maxItemLen = 80): string[] {
  if (!Array.isArray(val)) return [];
  const result: string[] = [];
  for (const item of val) {
    const cleaned = sanitizeText(item, maxItemLen);
    if (cleaned) {
      result.push(cleaned);
      if (result.length >= maxItems) break;
    }
  }
  return result;
}

function escapeIlike(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required." }), {
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
      return new Response(JSON.stringify({ error: "Session expired or unauthorized." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "image/jpeg";

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "Image payload is required." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (imageBase64.length > MAX_BASE64_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Image exceeds the 3 MB maximum size limit." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return new Response(
        JSON.stringify({ error: "Unsupported image format. Use JPEG, PNG, or WebP." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiApiKey = findGeminiKey();
    if (!geminiApiKey) {
      console.error("Missing GEMINI_API_KEY secret in Edge Function.");
      return new Response(
        JSON.stringify({
          error: "Sommelier AI service is not configured on the server.",
          code: "MISSING_GEMINI_KEY",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Atomic, advisory-locked rate limit check + increment via Postgres RPC
    const { data: allowed, error: quotaErr } = await supabase.rpc("consume_ai_quota", {
      p_action: "scan",
      p_max_per_hour: MAX_SCANS_PER_HOUR,
    });

    if (quotaErr || !allowed) {
      return new Response(
        JSON.stringify({
          error: `Hourly scan limit reached (${MAX_SCANS_PER_HOUR} scans/hour). Please try again shortly.`,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Call gemini-flash-lite-latest first (fastest & highest availability), with fallback to gemini-3.8-flash and gemini-flash-latest
    const modelsToTry = [
      "gemini-flash-lite-latest",
      "gemini-3.8-flash",
      "gemini-flash-latest",
    ];
    let geminiJson: any = null;

    for (const modelName of modelsToTry) {
      try {
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
          break;
        } else {
          const errText = await geminiRes.text();
          console.warn(`Model ${modelName} returned ${geminiRes.status}`);
          if (errText.includes("API_KEY_INVALID") || geminiRes.status === 403) {
            break;
          }
        }
      } catch (fetchErr) {
        console.warn(`Model ${modelName} timed out:`, fetchErr);
      }
    }

    if (!geminiJson) {
      return new Response(
        JSON.stringify({
          error: "Sommelier AI is temporarily busy. Please try scanning again in a moment.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "Could not read a wine label from that photo." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const cleanedText = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
    const parsed = JSON.parse(cleanedText);

    const producer = sanitizeText(parsed.producer, 200) || "Unknown Producer";
    const name = sanitizeText(parsed.name, 200) || "Wine";
    const rawVintage = typeof parsed.vintage === "number" ? Math.round(parsed.vintage) : null;
    const vintage =
      rawVintage && rawVintage >= 1800 && rawVintage <= 2100 ? rawVintage : null;

    const validTypes = ["red", "white", "rose", "sparkling", "dessert", "fortified", "orange"];
    const wineType = validTypes.includes(String(parsed.wine_type).toLowerCase())
      ? String(parsed.wine_type).toLowerCase()
      : "red";

    const rawAbv = typeof parsed.abv === "number" ? parsed.abv : null;
    const abv =
      rawAbv !== null && rawAbv >= 0 && rawAbv <= 100
        ? Math.round(rawAbv * 100) / 100
        : null;

    let query = supabase
      .from("wines")
      .select("*")
      .ilike("producer", escapeIlike(producer))
      .ilike("name", escapeIlike(name));

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

    // Return proposed profile without persisting to public.wines until user confirms
    const proposedWine = {
      producer,
      name,
      vintage,
      wine_type: wineType,
      region: sanitizeText(parsed.region, 200),
      sub_region: sanitizeText(parsed.sub_region, 200),
      country: sanitizeText(parsed.country, 100),
      appellation: sanitizeText(parsed.appellation, 200),
      varietals: sanitizeArray(parsed.varietals, 20, 80),
      abv,
      body: sanitizeText(parsed.body, 50),
      tannin: sanitizeText(parsed.tannin, 50),
      acidity: sanitizeText(parsed.acidity, 50),
      sweetness: sanitizeText(parsed.sweetness, 50),
      tasting_notes: sanitizeArray(parsed.tasting_notes, 20, 80),
      summary: sanitizeText(parsed.summary, 2000),
      food_pairings: sanitizeArray(parsed.food_pairings, 20, 100),
      serving_temp: sanitizeText(parsed.serving_temp, 100),
      decant_time: sanitizeText(parsed.decant_time, 100),
      drinking_window: sanitizeText(parsed.drinking_window, 100),
    };

    return new Response(
      JSON.stringify({ wine: proposedWine, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Unhandled Edge Function exception:", err);
    return new Response(
      JSON.stringify({ error: "Unable to process wine label right now." }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
