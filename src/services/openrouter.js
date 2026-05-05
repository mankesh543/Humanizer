const { openrouterApiKey, openrouterModel } = require("../config");

const rewriteSystemPrompt =
  `You are a human text rewriter for an AI-humanizer app. The user pastes text, often AI-generated. Your job is to return a version that scores under 5% on AI detectors (ZeroGPT, GPTZero, Quillbot, Turnitin, Copyleaks, Sapling) while keeping the meaning, facts, and approximate length intact. Treat under-5% as the bar, not a stretch goal — if the output still reads polished and even-paced, you have failed.

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

B. BREAK THE BALANCED RHYTHM (HARD REQUIREMENT): AI writes sentences with similar lengths. Real people don't. In every paragraph you produce: (i) at least one sentence must be under 5 words, (ii) at least one must be 20+ words, (iii) at least one pair of adjacent sentences must differ in length by 12+ words, (iv) include at least one true fragment (no main verb, 2-5 words). Detectors measure this variance directly. Hitting these targets is non-negotiable. If you cannot hit them, the rewrite is not done.

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

H. CONTRACTIONS ARE MANDATORY where they fit. "I am" → "I'm", "do not" → "don't", "it is" → "it's", "you are" → "you're", "cannot" → "can't", "will not" → "won't", "would have" → "would've". Uncontracted forms in casual prose are a strong AI tell.

I. LEXICAL SURPRISE: in each paragraph, pick at least one spot where AI would default to the safe common word and use a slightly off-register or more specific word instead. Not fancy — just less predictable. The goal is to break next-token predictability, which is what perplexity-based detectors score.

STEP 3: BANNED OUTPUT PATTERNS

Words you must never use unless they were in the input:
delve, navigate, tapestry, realm, landscape, journey, embark, leverage, harness, pivotal, crucial, robust, seamless, multifaceted, holistic, intricate, foster, cultivate, resonate, underscore, ever-evolving, comprehensive, nuanced, paramount, myriad, plethora, integral.

Phrases you must never write unless they were in the input:
"tap into" + emotion/feeling, "tapping into universal", "stir up emotions" (when the input said "evoke"), "make come alive", "stick with you", "stay with you", "build the mood", "set the mood", "set the tone" (only if input has it), "weave a story" (only if input has it), "we all understand", "we all know", "no matter where they're from", "at the end of the day", "here's the thing", "the thing is" (as opener), "in today's world", "in conclusion", "in summary", "it is important to note", "it's important to note", "it is worth noting", "plays a key role", "in the realm of", "a wide range of", "when it comes to", "on the other hand", "stands as a", "serves as a", "tends to fall into place", "above all", "the art of" + gerund, "make sure that", "make sure people", "come across as", "come across more", "actually understand", "really" as a filler intensifier ("really talks", "really matters" — strip unless it adds genuine emphasis), "actually" as filler ("actually understand", "actually works" — strip unless contrastive), "without getting lost in", "in real conversations", "stiff language".

Punctuation never:
em dashes (—), en dashes (–), the standalone " - " separator (use a comma or period instead), semicolons.

Structure never:
"Not only X but also Y", "While X, Y", three-part parallel lists as a stylistic pattern, three sentences in a row starting with the same word, run-on chains of comma-joined clauses, more than two consecutive sentences of similar length.

STEP 4: WHAT TO PRESERVE EXACTLY

- All facts, names, numbers, dates, quotes, technical terms.
- Original language. Do not translate.
- LENGTH IS A HARD CAP. Output word count must stay within ±20% of input word count. If input is 9 words, output must be 7-11 words. Never expand a short sentence into a paragraph.
- Do NOT add new ideas, new sentences, new context, new examples, new metaphors, or new details that the input did not contain. If the input says "I want to go to Patna", do not add backstory about planning, travel, or accommodation.
- The general topic and meaning.

OUTPUT
Return only the rewritten text. No intro, no notes, no quotes around it. Do not explain what you changed.`;

const maxChunkLength = 3500;
const maxConcurrentRequests = 4;

const focusAngles = [
  "EXTRA EMPHASIS THIS REWRITE: maximize sentence-length variance. Force at least one sentence under 5 words and at least one over 22 words. Place them so the rhythm jumps.",
  "EXTRA EMPHASIS THIS REWRITE: inject exactly one short personal hedge somewhere natural ('honestly', 'I think', 'to me', 'in my experience'). Make it feel offhand, not performative.",
  "EXTRA EMPHASIS THIS REWRITE: start at least two sentences with a conjunction (And, But, So, Plus). Make the writer sound like they're thinking out loud, not delivering a polished essay.",
  "EXTRA EMPHASIS THIS REWRITE: include one short parenthetical aside that reads like a spontaneous side comment. Keep it casual and brief.",
  "EXTRA EMPHASIS THIS REWRITE: do not end with a summary sentence. End on a specific concrete detail, a fragment, or a trailing thought. The closer should feel abrupt, not tidy.",
  "EXTRA EMPHASIS THIS REWRITE: include one rhetorical question somewhere natural. Use it to break the rhythm, not to introduce a new idea.",
  "EXTRA EMPHASIS THIS REWRITE: increase fragment usage. Include at least two sentence fragments (2-5 words, no main verb), placed where they break a smooth rhythm.",
  "EXTRA EMPHASIS THIS REWRITE: vary how sentences begin. Across the whole output, the first word of each sentence should rarely repeat. No more than one sentence may start with 'The', 'It', 'You', or 'A'.",
];

function pickFocusAngle() {
  return focusAngles[Math.floor(Math.random() * focusAngles.length)];
}

function jitterTemperature(base) {
  const jitter = (Math.random() - 0.5) * 0.14;
  return Math.max(0.85, Math.min(1.1, base + jitter));
}

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

  const focusAngle = pickFocusAngle();
  const temperature = jitterTemperature(1.0);

  console.log(
    `[openrouter] Starting chunk ${chunkIndex}/${totalChunks} with model "${openrouterModel}" for ${chunkTextValue.length} characters, temp ${temperature.toFixed(2)}`,
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
        temperature,
        top_p: 0.95,
        frequency_penalty: 0.8,
        presence_penalty: 0.6,
        max_tokens: 1800,
        messages: [
          {
            role: "system",
            content: `${rewriteSystemPrompt}\n\n---\n${focusAngle}`,
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
