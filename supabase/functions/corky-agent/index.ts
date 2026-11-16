import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_MESSAGE_LENGTH = 2000;
const MAX_BASE64_LENGTH = 4_000_000;
const MAX_MESSAGES_PER_HOUR = 40;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const CORKY_SYSTEM_INSTRUCTION = `You are Corky 🍷, Uncorked's personal AI sommelier. You are warm, witty, unpretentious, and deeply knowledgeable about wine.
You have direct access to the user's personal wine cellar and tasting history through tools.

Your 4 core roles:
1. WINE INVESTIGATOR: When the user shares a bottle photo or asks about a specific bottle, inspect it carefully. If the exact vintage, cuvée, or producer is blurry, cut off, or ambiguous, explicitly ask the user to clarify rather than guessing or making it up!
2. PERSONAL PALATE DETECTIVE: When asked about their tastes, preferences, or what they should try next, ALWAYS call \`get_palate_profile\` first. Identify patterns in their ratings (e.g., fruit-forward vs. earthy, body/tannin preferences, favorite regions vs. regions they haven't explored yet) and explain them in plain, conversational English.
3. DINNER PAIRING ASSISTANT: When the user asks what to open with a meal (e.g. "We're having steak tonight, what should I open?"), ALWAYS call \`search_user_cellar\` first! Prioritize bottles they currently have on hand (\`bottles_on_hand > 0\`), or if none are marked on hand, reference the actual bottles in their cellar log so you recommend wines from their collection rather than random bottles they don't own.
4. WINE EDUCATOR: When the user asks how a wine compares to something they tried before (e.g. "What makes this Chianti different from that Rioja I liked?"), call \`compare_wines\` or \`search_user_cellar\` to retrieve their actual past bottles, ratings, and tasting notes, and explain the differences personalized to their experience.

Keep responses concise, engaging, and well-structured with short paragraphs or bullet points.`;

const CORKY_TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_palate_profile",
        description:
          "Analyzes the user's entire wine cellar and rating history to compute favorite grape varietals, wine types, body/tannin/acidity preferences, top-rated bottles, lowest-rated bottles, and unexplored regions.",
        parameters: {
          type: "OBJECT",
          properties: {},
        },
      },
      {
        name: "search_user_cellar",
        description:
          "Searches the user's personal wine cellar logs (including ratings, personal tasting notes, bottles currently on hand, grape varietals, tasting notes, and food pairings). Call this whenever recommending a bottle to open, answering questions about what they own/drank, or pairing with dinner.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description:
                "Optional keyword to match against producer, wine name, grape varietal, region, country, aroma note, or food pairing (leave empty to fetch all cellar bottles).",
            },
            wine_type: {
              type: "STRING",
              description:
                "Optional filter by wine type: red, white, rose, sparkling, dessert, fortified, or orange.",
            },
            only_in_stock: {
              type: "BOOLEAN",
              description:
                "Set to true to only return bottles with bottles_on_hand > 0. Leave false to return all logged bottles (including bottles_on_hand count).",
            },
            min_rating: {
              type: "NUMBER",
              description: "Optional minimum user rating (0.0 to 5.0).",
            },
          },
        },
      },
      {
        name: "compare_wines",
        description:
          "Retrieves detailed structure (body, tannin, acidity, sweetness, varietals, region) and the user's personal ratings/notes for 1 to 3 wines by name, producer, grape, or region so you can compare them side by side.",
        parameters: {
          type: "OBJECT",
          properties: {
            search_terms: {
              type: "ARRAY",
              items: { type: "STRING" },
              description:
                "1 to 3 wine names, producers, regions, or varietals to look up in the user's cellar and catalog (e.g. ['Rioja', 'Chianti']).",
            },
          },
          required: ["search_terms"],
        },
      },
      {
        name: "search_global_catalog",
        description:
          "Searches the shared Uncorked global wine catalog for bottles matching a style, grape, region, or flavor profile.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: {
              type: "STRING",
              description: "Grape varietal, region, country, producer, or flavor note to search for.",
            },
            wine_type: {
              type: "STRING",
              description: "Optional wine type filter: red, white, rose, sparkling, dessert, fortified, orange.",
            },
          },
        },
      },
    ],
  },
];

function findGeminiKey(): string | null {
  const candidates = [
    Deno.env.get("GEMINI_API_KEY"),
    Deno.env.get("GOOGLE_API_KEY"),
    Deno.env.get("GEMINI_KEY"),
  ];
  for (const val of candidates) {
    if (val && val.trim()) {
      return val.trim().replace(/^["']|["']$/g, "");
    }
  }
  return null;
}

async function executeToolCall(
  supabase: any,
  userId: string,
  name: string,
  args: Record<string, any>
): Promise<{ result: any; badge: string }> {
  if (name === "get_palate_profile") {
    const { data: logs } = await supabase
      .from("wine_logs")
      .select("*, wines(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    const items = logs || [];
    if (items.length === 0) {
      return {
        badge: "🧬 Palate Detective",
        result: {
          total_bottles_logged: 0,
          message: "The user has not logged any bottles in their cellar yet.",
        },
      };
    }

    const byType: Record<string, { count: number; ratingSum: number; ratedCount: number }> = {};
    const byVarietal: Record<string, { count: number; ratingSum: number; ratedCount: number }> = {};
    const byCountry: Record<string, { count: number; ratingSum: number; ratedCount: number }> = {};
    const byBody: Record<string, { count: number; ratingSum: number; ratedCount: number }> = {};

    let totalInStock = 0;

    for (const log of items) {
      const w = log.wines || {};
      const r = log.rating != null ? Number(log.rating) : null;
      totalInStock += Number(log.bottles_on_hand || 0);

      const addStat = (
        map: Record<string, { count: number; ratingSum: number; ratedCount: number }>,
        key: string | null | undefined
      ) => {
        if (!key) return;
        if (!map[key]) map[key] = { count: 0, ratingSum: 0, ratedCount: 0 };
        map[key].count += 1;
        if (r != null) {
          map[key].ratingSum += r;
          map[key].ratedCount += 1;
        }
      };

      addStat(byType, w.wine_type);
      addStat(byCountry, w.country);
      addStat(byBody, w.body);
      for (const v of w.varietals || []) {
        addStat(byVarietal, v);
      }
    }

    const summarizeMap = (
      map: Record<string, { count: number; ratingSum: number; ratedCount: number }>
    ) =>
      Object.entries(map)
        .map(([k, v]) => ({
          name: k,
          count: v.count,
          avg_rating: v.ratedCount > 0 ? Number((v.ratingSum / v.ratedCount).toFixed(2)) : null,
        }))
        .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0) || b.count - a.count);

    const favorites = items
      .filter((l: any) => l.rating != null && Number(l.rating) >= 4.0)
      .sort((a: any, b: any) => Number(b.rating) - Number(a.rating))
      .slice(0, 6)
      .map((l: any) => ({
        producer: l.wines?.producer,
        name: l.wines?.name,
        vintage: l.wines?.vintage,
        wine_type: l.wines?.wine_type,
        varietals: l.wines?.varietals,
        region: l.wines?.region,
        country: l.wines?.country,
        body: l.wines?.body,
        tannin: l.wines?.tannin,
        acidity: l.wines?.acidity,
        tasting_notes: l.wines?.tasting_notes,
        user_rating: Number(l.rating),
        user_notes: l.tasting_notes,
        bottles_on_hand: l.bottles_on_hand,
      }));

    const lowestRated = items
      .filter((l: any) => l.rating != null && Number(l.rating) < 3.8)
      .sort((a: any, b: any) => Number(a.rating) - Number(b.rating))
      .slice(0, 4)
      .map((l: any) => ({
        producer: l.wines?.producer,
        name: l.wines?.name,
        wine_type: l.wines?.wine_type,
        varietals: l.wines?.varietals,
        country: l.wines?.country,
        user_rating: Number(l.rating),
        user_notes: l.tasting_notes,
      }));

    return {
      badge: "🧬 Palate Detective",
      result: {
        total_bottles_logged: items.length,
        total_bottles_on_hand: totalInStock,
        by_wine_type: summarizeMap(byType),
        by_varietal: summarizeMap(byVarietal).slice(0, 10),
        by_country: summarizeMap(byCountry),
        by_body: summarizeMap(byBody),
        top_rated_bottles: favorites,
        lower_rated_bottles: lowestRated,
      },
    };
  }

  if (name === "search_user_cellar") {
    const { data: logs } = await supabase
      .from("wine_logs")
      .select("*, wines(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    const q = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
    const wineType =
      typeof args.wine_type === "string" ? args.wine_type.trim().toLowerCase() : "";
    const onlyInStock = Boolean(args.only_in_stock);
    const minRating = typeof args.min_rating === "number" ? args.min_rating : null;

    let filtered = (logs || []).filter((l: any) => {
      const w = l.wines || {};
      if (onlyInStock && (l.bottles_on_hand ?? 0) <= 0) return false;
      if (wineType && String(w.wine_type || "").toLowerCase() !== wineType) return false;
      if (minRating !== null && (l.rating == null || Number(l.rating) < minRating)) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        w.producer,
        w.name,
        w.region,
        w.sub_region,
        w.country,
        w.appellation,
        w.summary,
        ...(w.varietals || []),
        ...(w.tasting_notes || []),
        ...(w.food_pairings || []),
        l.tasting_notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const fallbackAll =
      filtered.length === 0 && (logs || []).length > 0 ? (logs || []).slice(0, 15) : [];

    const formatBottle = (l: any) => ({
      log_id: l.id,
      wine_id: l.wine_id,
      producer: l.wines?.producer,
      name: l.wines?.name,
      vintage: l.wines?.vintage,
      wine_type: l.wines?.wine_type,
      region: l.wines?.region,
      country: l.wines?.country,
      varietals: l.wines?.varietals,
      body: l.wines?.body,
      tannin: l.wines?.tannin,
      acidity: l.wines?.acidity,
      sweetness: l.wines?.sweetness,
      tasting_notes: l.wines?.tasting_notes,
      food_pairings: l.wines?.food_pairings,
      serving_temp: l.wines?.serving_temp,
      decant_time: l.wines?.decant_time,
      user_rating: l.rating != null ? Number(l.rating) : null,
      user_notes: l.tasting_notes,
      price_paid: l.price_paid != null ? Number(l.price_paid) : null,
      bottles_on_hand: l.bottles_on_hand ?? 0,
      drank_at: l.drank_at,
    });

    return {
      badge: "🍷 Searched My Cellar",
      result: {
        matched_count: filtered.length,
        matches: filtered.slice(0, 20).map(formatBottle),
        all_cellar_bottles_if_no_exact_match: fallbackAll.map(formatBottle),
      },
    };
  }

  if (name === "compare_wines") {
    const terms: string[] = Array.isArray(args.search_terms)
      ? args.search_terms.map((t: any) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 4)
      : [];

    const { data: logs } = await supabase
      .from("wine_logs")
      .select("*, wines(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    const results: any[] = [];
    for (const term of terms) {
      const matchedLogs = (logs || []).filter((l: any) => {
        const w = l.wines || {};
        const text = [
          w.producer,
          w.name,
          w.region,
          w.country,
          w.appellation,
          ...(w.varietals || []),
          l.tasting_notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return text.includes(term);
      });

      results.push({
        search_term: term,
        user_logged_matches: matchedLogs.slice(0, 5).map((l: any) => ({
          producer: l.wines?.producer,
          name: l.wines?.name,
          vintage: l.wines?.vintage,
          wine_type: l.wines?.wine_type,
          region: l.wines?.region,
          country: l.wines?.country,
          appellation: l.wines?.appellation,
          varietals: l.wines?.varietals,
          body: l.wines?.body,
          tannin: l.wines?.tannin,
          acidity: l.wines?.acidity,
          sweetness: l.wines?.sweetness,
          tasting_notes: l.wines?.tasting_notes,
          summary: l.wines?.summary,
          user_rating: l.rating != null ? Number(l.rating) : null,
          user_notes: l.tasting_notes,
          drank_at: l.drank_at,
        })),
      });
    }

    return {
      badge: "⚖️ Wine Comparison",
      result: { comparisons: results },
    };
  }

  if (name === "search_global_catalog") {
    const q = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
    const wineType =
      typeof args.wine_type === "string" ? args.wine_type.trim().toLowerCase() : "";

    let dbQuery = supabase.from("wines").select("*").order("created_at", { ascending: false }).limit(50);
    if (wineType) {
      dbQuery = dbQuery.eq("wine_type", wineType);
    }
    const { data: wines } = await dbQuery;
    const matched = (wines || []).filter((w: any) => {
      if (!q) return true;
      const text = [
        w.producer,
        w.name,
        w.region,
        w.country,
        ...(w.varietals || []),
        ...(w.tasting_notes || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(q);
    });

    return {
      badge: "🌍 Global Catalog",
      result: {
        wines: matched.slice(0, 10),
      },
    };
  }

  return {
    badge: "🍷 Sommelier Tool",
    result: { error: `Unknown tool: ${name}` },
  };
}

async function callGeminiWithFallback(
  apiKey: string,
  payload: Record<string, any>
): Promise<any> {
  const models = [
    "gemini-3.8-flash-lite",
    "gemini-3.8-flash",
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
  ];

  for (const modelName of models) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(15000),
          body: JSON.stringify(payload),
        }
      );

      if (res.ok) {
        return await res.json();
      }
      const errText = await res.text();
      console.warn(`Corky model ${modelName} status ${res.status}:`, errText.slice(0, 200));
      if (errText.includes("API_KEY_INVALID") || res.status === 403) {
        break;
      }
    } catch (err) {
      console.warn(`Corky model ${modelName} timeout/error:`, err);
    }
  }
  return null;
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
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64 : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "image/jpeg";
    const history = Array.isArray(body?.history) ? body.history.slice(-10) : [];

    if (!message && !imageBase64) {
      return new Response(JSON.stringify({ error: "Please enter a message or attach a photo." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (message.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters.` }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (imageBase64 && imageBase64.length > MAX_BASE64_LENGTH) {
      return new Response(
        JSON.stringify({ error: "Image exceeds the 3 MB maximum size limit." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (imageBase64 && !ALLOWED_MIME_TYPES.has(mimeType)) {
      return new Response(
        JSON.stringify({ error: "Unsupported image format." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentMsgs } = await supabase
      .from("corky_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "user")
      .gte("created_at", oneHourAgo);

    if ((recentMsgs ?? 0) >= MAX_MESSAGES_PER_HOUR) {
      return new Response(
        JSON.stringify({
          error: "Corky needs a quick breather (hourly message limit reached). Try again soon!",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const geminiApiKey = findGeminiKey();
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: "Corky AI key is not configured on the server." }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const contents: any[] = [];
    for (const h of history) {
      if (h && typeof h.content === "string" && h.content.trim()) {
        contents.push({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content.slice(0, 2000) }],
        });
      }
    }

    const userParts: any[] = [];
    if (message) {
      userParts.push({ text: message });
    } else {
      userParts.push({
        text: "Please inspect this wine photo and tell me about it (or ask me to clarify if any label details like vintage or producer are unclear).",
      });
    }

    if (imageBase64) {
      userParts.push({
        inlineData: {
          mimeType,
          data: imageBase64,
        },
      });
    }

    contents.push({ role: "user", parts: userParts });

    await supabase.from("corky_messages").insert({
      user_id: user.id,
      role: "user",
      content: message || "📷 [Sent a wine photo]",
      tools_used: [],
    });

    const toolsUsedBadges: string[] = [];
    let finalReply = "";

    for (let step = 0; step < 3; step++) {
      const geminiJson = await callGeminiWithFallback(geminiApiKey, {
        systemInstruction: {
          parts: [{ text: CORKY_SYSTEM_INSTRUCTION }],
        },
        contents,
        tools: CORKY_TOOLS,
        generationConfig: {
          temperature: 0.4,
        },
      });

      if (!geminiJson) {
        return new Response(
          JSON.stringify({
            error: "Corky is temporarily busy in the cellar. Please try again in a moment!",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const candidateContent = geminiJson?.candidates?.[0]?.content;
      const parts: any[] = candidateContent?.parts || [];
      const functionCalls = parts.filter((p) => p.functionCall);

      if (functionCalls.length === 0) {
        finalReply = parts
          .map((p) => p.text || "")
          .join("")
          .trim();
        break;
      }

      contents.push({
        role: "model",
        parts,
      });

      const responseParts: any[] = [];
      for (const part of functionCalls) {
        const fc = part.functionCall;
        const { result, badge } = await executeToolCall(
          supabase,
          user.id,
          fc.name,
          fc.args || {}
        );
        if (!toolsUsedBadges.includes(badge)) {
          toolsUsedBadges.push(badge);
        }
        responseParts.push({
          functionResponse: {
            name: fc.name,
            response: result,
          },
        });
      }

      contents.push({
        role: "user",
        parts: responseParts,
      });
    }

    if (!finalReply) {
      finalReply =
        "I checked your cellar, but couldn't put together a full answer right now—try asking me again!";
    }

    const sanitizedReply = finalReply.slice(0, 7500);

    await supabase.from("corky_messages").insert({
      user_id: user.id,
      role: "assistant",
      content: sanitizedReply,
      tools_used: toolsUsedBadges.slice(0, 10),
    });

    return new Response(
      JSON.stringify({
        reply: sanitizedReply,
        toolsUsed: toolsUsedBadges,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unhandled Corky Agent error:", err);
    return new Response(
      JSON.stringify({ error: "Corky encountered an unexpected hiccup. Please try again." }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
