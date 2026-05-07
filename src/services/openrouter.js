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

function presetOverride(preset) {
  switch (preset) {
    case "casual":
      return "Casual conversational voice — lean into contractions, short sentences, informal asides, second-person address. The base variance/fragment rules amplify this preset; apply them in full.";
    case "editorial":
      return "Editorial voice — confident, polished, with personality. Apply the base rules in full. Polish should come from rhythm and word choice, never from balanced even-paced prose.";
    case "academic":
      return "Academic-but-human voice — long reasoned sentences are PERMITTED here, paired with the required short sentences and fragments to keep variance. Precise domain vocabulary is allowed, BUT the banned-word list still applies (no 'comprehensive', 'nuanced', 'multifaceted', 'paramount', etc. — find specific concrete equivalents). The output must still read like a real academic person wrote it, never sterile or 'AI-academic'.";
    case "marketing":
      return "Marketing voice — punchy, declarative, on-brand. Maximize fragments and short sentences. Lead with concrete claims. Heavy use of second-person.";
    case "narrative":
      return "Narrative storyteller voice — specific scenes, sensory detail, direct address. Concrete over abstract. Apply the base rules in full.";
    case "technical":
      return "Technical voice — plain English without losing precision. Preserve technical/domain terms exactly as they appear in the input. Variance and fragment rules still apply; allow factual longer sentences when accuracy requires it.";
    default:
      return null;
  }
}

function strengthOverride(value) {
  if (typeof value !== "number") return null;
  if (value < 0.34) {
    return "STRENGTH = SUBTLE — do MINIMAL edits. SKIP the Step 2 structural transformations (sections A through I). Apply ONLY: (1) the banned-word and banned-phrase list from Step 3, (2) the punctuation rules (no em-dashes, en-dashes, semicolons, ' - ' separators), (3) replacement of any obvious AI cliches that survive in the input. Do NOT restructure sentences. Do NOT introduce new variance. Do NOT add fragments where none existed. Preserve original rhythm and most word choices. The output should read very close to the input with the AI tells surgically removed.";
  }
  if (value < 0.67) {
    return "STRENGTH = BALANCED — apply the Step 2 transformations as written. Default rewrite intensity.";
  }
  return "STRENGTH = AGGRESSIVE — amplify Step 2 transformations. Push sentence-length variance harder (target a 15+ word delta between adjacent sentences in every paragraph, multiple fragments per paragraph). Replace roughly 30% of original vocabulary with less predictable, more specific equivalents. Reorder sentences within paragraphs when it improves human rhythm.";
}

function readingLevelOverride(value) {
  if (typeof value !== "number" || value < 5 || value > 16) return null;
  if (value <= 7) {
    return `READING LEVEL = Grade ${value} (simple/elementary) — short sentences, common everyday vocabulary, no nested clauses, no jargon. RELAX the 20+ word sentence requirement to one such sentence per 4-5 paragraphs. The fragment requirement still applies. Banned-word list still applies.`;
  }
  if (value <= 11) {
    return `READING LEVEL = Grade ${value} (general adult reader) — apply the base rules in full.`;
  }
  if (value <= 14) {
    return `READING LEVEL = Grade ${value} (advanced general / college) — allow more complex sentence structure and broader, more specific vocabulary. Variance and fragment rules still apply. Banned-word list still applies.`;
  }
  return `READING LEVEL = Grade ${value} (academic / professional) — long reasoned sentences are permitted. RELAX the 'under 5 words' rule to one short sentence or fragment per 3 paragraphs. Precise domain vocabulary is allowed. The banned-word list and the 'no AI cliches' rule still apply absolutely — academic does not mean 'AI-academic'.`;
}

function lengthOverride(value) {
  switch (value) {
    case "shorter":
      return "LENGTH = SHORTER — target ~25% shorter than the input. OVERRIDE the ±20% cap from Step 4 to allow up to -30%. Cut filler, throat-clearing, redundant phrases, and summary-wrap closers.";
    case "longer":
      return "LENGTH = LONGER — target ~25% longer than the input. OVERRIDE the ±20% cap from Step 4 to allow up to +30%. Expand only with concrete specificity (one extra concrete detail, a sensory beat, a tighter example). Never pad with filler. Do not invent facts.";
    case "same":
      return "LENGTH = SAME — stay within ±20% of the input as per the base rules.";
    default:
      return null;
  }
}

function customInstructionsOverride(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 500);
  if (!trimmed) return null;
  return `USER CUSTOM INSTRUCTIONS (treat as authoritative within the priority order below): ${trimmed}`;
}

function buildSystemPromptAddendum(voice) {
  if (!voice || typeof voice !== "object") return "";
  const items = [
    presetOverride(voice.preset),
    strengthOverride(voice.strength),
    readingLevelOverride(voice.readingLevel),
    lengthOverride(voice.length),
    customInstructionsOverride(voice.customInstructions),
  ].filter(Boolean);
  if (items.length === 0) return "";
  return [
    "STEP 5 — USER STYLE OVERRIDES",
    "These overrides modify Steps 2-4 above. Apply them, but observe this strict priority order:",
    "  PRIORITY 1 (never compromised): score under 5% on AI detectors. If any override pushes the output toward AI-detectable patterns, soften the override before sacrificing this goal.",
    "  PRIORITY 2 (never compromised): the banned-word list, the banned-phrase list, and the punctuation rules from Step 3. These apply regardless of preset, reading level, or custom instructions.",
    "  PRIORITY 3: the user overrides below.",
    "",
    "Active overrides:",
    ...items.map((s, i) => `${i + 1}. ${s}`),
    "",
    "If a user override conflicts with Priority 1 or 2, choose the rewrite path that satisfies all three — never sacrifice detector evasion or violate the banned lists.",
  ].join("\n");
}

async function rewriteChunk(
  chunkTextValue,
  chunkIndex,
  totalChunks,
  userApiKey,
  voice,
) {
  const effectiveKey = userApiKey || openrouterApiKey;
  if (!effectiveKey) {
    throw new Error(
      "No OpenRouter key available. Set OPENROUTER_API_KEY in backend/.env or save a key in the app's Settings screen.",
    );
  }

  const focusAngle = pickFocusAngle();
  const temperature = jitterTemperature(1.0);
  const keySource = userApiKey ? "user" : "server";
  const styleAddendum = buildSystemPromptAddendum(voice);
  const systemContent = styleAddendum
    ? `${rewriteSystemPrompt}\n\n---\n${focusAngle}\n\n---\n${styleAddendum}`
    : `${rewriteSystemPrompt}\n\n---\n${focusAngle}`;

  console.log(
    `[openrouter] Starting chunk ${chunkIndex}/${totalChunks} with model "${openrouterModel}" for ${chunkTextValue.length} characters, temp ${temperature.toFixed(2)}, key=${keySource}, voice=${styleAddendum ? "on" : "off"}`,
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  let response;

  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${effectiveKey}`,
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
            content: systemContent,
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
  const { onProgress, userApiKey, voice } = options;
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
        userApiKey,
        voice,
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
