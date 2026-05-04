const { openrouterApiKey, openrouterModel } = require("../config");

const rewriteSystemPrompt =
  `You are a human text rewriter for an AI-humanizer app. The user pastes text, often AI-generated. Your job is to return a version that scores under 10% on AI detectors (ZeroGPT, GPTZero, Quillbot, Turnitin, Copyleaks, Sapling) while keeping the meaning, facts, and approximate length intact.

STEP 1: DIAGNOSE THE INPUT
Before rewriting, read the input and identify if it has these AI signals:
- Generic third-person claims about a topic in the abstract ("A photography blog can...")
- Smooth, balanced sentence rhythm with similar lengths
- Three-part lists ("X, Y, and Z")
- Abstract universal language ("feelings we all understand", "viewers", "audiences")
- Polished transitions, no rough edges
- No personal voice, no specific examples, no direct address

If the input has any of these signals, it is AI text and you must REWRITE STRUCTURALLY. Do not just swap words. Word-swapping leaves the AI signature intact and the score does not drop.

If the input already sounds like a real person wrote it (specific details, varied rhythm, direct address, personal voice), do minimal edits.

STEP 2: WHEN AI INPUT IS DETECTED, APPLY THESE TRANSFORMATIONS

A. SHIFT VOICE: convert generic third-person claims into direct second-person address.
   AI: "A photography blog can evoke emotion by weaving a story."
   Human: "If you want your photo blog to actually move someone, the story has to come first."

B. BREAK THE BALANCED RHYTHM: AI writes sentences with similar lengths. Real people don't. Mix one short sentence (3-7 words) with one longer one (18+ words) in every paragraph. Make adjacent sentences differ in length sharply at least once.

C. DESTROY PARALLEL LISTS: AI loves "X, Y, and Z" patterns. Break them. Pick the most concrete item and lead with it. Drop or restructure the others.
   AI: "...by weaving a story, providing context, and focusing on feelings."
   Human: "...by leading with one specific detail. The story builds from there. Context comes second."

D. REPLACE ABSTRACT UNIVERSALS WITH SPECIFIC SCENES OR HEDGES: AI writes "feelings we all understand" — replace with a concrete situation OR a personal hedge.
   AI: "feelings anyone can relate to"
   Human: "the kind of feeling that hits you before you even know why"
   OR: "something that feels familiar, even if you can't place it"

E. BREAK SUMMARY-WRAP ENDINGS: AI ends paragraphs with a tidy closing sentence. End instead on a specific detail, a fragment, a trailing thought, or just stop.

F. INJECT ONE PERSONAL HEDGE PER PARAGRAPH (only if natural): "I think", "to me", "in my experience", "honestly". Use sparingly. Once is enough.

G. ALLOW ONE PARENTHETICAL ASIDE OR SHORT FRAGMENT per output. Keep it natural. Examples: "(at least for me)", "Worth a shot.", "Hard to argue with that."

STEP 3: BANNED OUTPUT PATTERNS

Words you must never use unless they were in the input:
delve, navigate, tapestry, realm, landscape, journey, embark, leverage, harness, pivotal, crucial, robust, seamless, multifaceted, holistic, intricate, foster, cultivate, resonate, underscore, ever-evolving, comprehensive, nuanced, paramount, myriad, plethora, integral.

Phrases you must never write unless they were in the input:
"tap into" + emotion/feeling, "tapping into universal", "stir up emotions" (when the input said "evoke"), "make come alive", "stick with you", "stay with you", "build the mood", "set the mood", "set the tone" (only if input has it), "weave a story" (only if input has it), "we all understand", "we all know", "no matter where they're from", "at the end of the day", "here's the thing", "the thing is" (as opener), "in today's world", "in conclusion", "in summary", "it is important to note", "it's important to note", "it is worth noting", "plays a key role", "in the realm of", "a wide range of", "when it comes to", "on the other hand", "stands as a", "serves as a", "tends to fall into place", "above all", "the art of" + gerund.

Punctuation never:
em dashes (—), en dashes (–), the standalone " - " separator (use a comma or period instead), semicolons.

Structure never:
"Not only X but also Y", "While X, Y", three-part parallel lists as a stylistic pattern, three sentences in a row starting with the same word, run-on chains of comma-joined clauses, more than two consecutive sentences of similar length.

STEP 4: WHAT TO PRESERVE EXACTLY

- All facts, names, numbers, dates, quotes, technical terms.
- Original language. Do not translate.
- Approximate length. Do not pad. Do not chop.
- The general topic and meaning.

OUTPUT
Return only the rewritten text. No intro, no notes, no quotes around it. Do not explain what you changed.`;

const maxChunkLength = 3500;
const maxConcurrentRequests = 4;

function chunkText(inputText) {
  const normalized = inputText.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= maxChunkLength) {
    return [normalized];
  }

  const paragraphs = normalized.split(/\n\s*\n/);
  const chunks = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length <= maxChunkLength) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    if (paragraph.length <= maxChunkLength) {
      current = paragraph;
      continue;
    }

    for (let index = 0; index < paragraph.length; index += maxChunkLength) {
      chunks.push(paragraph.slice(index, index + maxChunkLength));
    }
    current = "";
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.filter(Boolean);
}

function scrubAiTells(text) {
  if (!text) return text;
  let out = text;

  out = out.replace(/\s*—\s*/g, ", ");
  out = out.replace(/\s*–\s*/g, ", ");
  out = out.replace(/[“”]/g, '"');
  out = out.replace(/[‘’]/g, "'");
  out = out.replace(/…/g, "...");

  const swaps = [
    [/\bFurthermore,?\s*/g, "Also "],
    [/\bfurthermore,?\s*/g, "also "],
    [/\bMoreover,?\s*/g, "Also "],
    [/\bmoreover,?\s*/g, "also "],
    [/\bAdditionally,?\s*/g, "Also "],
    [/\badditionally,?\s*/g, "also "],
    [/\bConsequently,?\s*/g, "So "],
    [/\bconsequently,?\s*/g, "so "],
    [/\bNevertheless,?\s*/g, "Still "],
    [/\bnevertheless,?\s*/g, "still "],
    [/\bIt is important to note that\s*/gi, ""],
    [/\bIt's important to note that\s*/gi, ""],
    [/\bIt is worth noting that\s*/gi, ""],
    [/\bIt's worth noting that\s*/gi, ""],
    [/\bIn conclusion,?\s*/gi, ""],
    [/\bIn summary,?\s*/gi, ""],
    [/\bWhen it comes to\b/g, "with"],
    [/\bwhen it comes to\b/g, "with"],
    [/\bIn order to\b/g, "to"],
    [/\bin order to\b/g, "to"],
    [/\butilizes\b/g, "uses"],
    [/\butilized\b/g, "used"],
    [/\butilize\b/g, "use"],
    [/\bdemonstrates\b/g, "shows"],
    [/\bdemonstrated\b/g, "showed"],
    [/\bdemonstrate\b/g, "show"],
    [/\bfacilitates\b/g, "helps"],
    [/\bfacilitated\b/g, "helped"],
    [/\bfacilitate\b/g, "help"],
  ];

  for (const [pattern, replacement] of swaps) {
    out = out.replace(pattern, replacement);
  }

  out = out.replace(/  +/g, " ");
  out = out.replace(/\s+([.,!?;:])/g, "$1");
  out = out.replace(/\.\s*\./g, ".");

  return out.trim();
}

async function rewriteChunk(chunkTextValue, chunkIndex, totalChunks) {
  if (!openrouterApiKey) {
    throw new Error("Missing OPENROUTER_API_KEY in backend/.env");
  }

  console.log(
    `[openrouter] Starting chunk ${chunkIndex}/${totalChunks} with model "${openrouterModel}" for ${chunkTextValue.length} characters`,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  let response;

  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openrouterApiKey}`,
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Huminzer",
      },
      body: JSON.stringify({
        model: openrouterModel,
        stream: false,
        temperature: 1.0,
        top_p: 0.95,
        frequency_penalty: 0.8,
        presence_penalty: 0.6,
        max_tokens: 1800,
        messages: [
          {
            role: "system",
            content: rewriteSystemPrompt,
          },
          {
            role: "user",
            content: chunkTextValue,
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("[openrouter] Request timed out");
      throw new Error(
        "OpenRouter request timed out. Check your internet connection, API key, and selected model.",
      );
    }

    console.error("[openrouter] Network error:", error.message);
    throw new Error(
      "Could not connect to OpenRouter. Check your internet connection or firewall and try again.",
    );
  } finally {
    clearTimeout(timeoutId);
  }

  const payload = await response.json();
  console.log(
    `[openrouter] Chunk ${chunkIndex}/${totalChunks} response status: ${response.status}`,
  );
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      "OpenRouter request failed";
    console.error("[openrouter] API error:", message);
    throw new Error(message);
  }

  const raw = payload?.choices?.[0]?.message?.content?.trim() || "";
  const result = scrubAiTells(raw);
  console.log(
    `[openrouter] Chunk ${chunkIndex}/${totalChunks} rewrite complete: ${result.length} characters returned`,
  );
  return result;
}

async function humanizeText(inputText, options = {}) {
  const { onProgress } = options;
  const chunks = chunkText(inputText);
  console.log(`[openrouter] Split input into ${chunks.length} chunk(s)`);

  const rewrittenChunks = new Array(chunks.length);
  const inProgressCount = { count: 0 };

  const processChunk = async (index) => {
    try {
      inProgressCount.count++;
      if (onProgress) {
        onProgress({
          stage: "rewriting",
          currentChunk: index + 1,
          totalChunks: chunks.length,
          message: `Rewriting chunk ${index + 1} of ${chunks.length}`,
        });
      }
      const rewrittenChunk = await rewriteChunk(
        chunks[index],
        index + 1,
        chunks.length,
      );
      rewrittenChunks[index] = rewrittenChunk;
      inProgressCount.count--;
    } catch (error) {
      inProgressCount.count--;
      throw error;
    }
  };

  const processingQueue = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const promise = (async () => {
      await new Promise((resolve) => {
        const checkQueue = setInterval(() => {
          if (inProgressCount.count < maxConcurrentRequests) {
            clearInterval(checkQueue);
            resolve();
          }
        }, 50);
      });
      await processChunk(index);
    })();
    processingQueue.push(promise);
  }

  await Promise.all(processingQueue);

  return rewrittenChunks.join("\n\n");
}

module.exports = {
  humanizeText,
};
