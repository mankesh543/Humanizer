const { openrouterApiKey, openrouterModel } = require("../config");
const { loadDict } = require("./learnedDictionary");

const grammarSystemPromptBase = `You are a precise grammar and spelling checker. Return JSON listing CLEAR errors. Do not over-flag stylistic choices, but DO flag mechanical/unambiguous errors every time.

ALWAYS FLAG (these are mechanical — never skip them):
- Sentence-start capitalization: the very first letter of every sentence MUST be uppercase. Lowercase first letter = error, always.
- The pronoun "I" as a standalone word: must be uppercase "I". Lowercase "i" used as a pronoun = error, always.
- Clear proper nouns: personal names, place names (e.g., "Patna", "London", common first/last names) when written lowercase.

DETECT WHEN CLEARLY WRONG:
- Spelling typos: "wnat" -> "want", "tomorow" -> "tomorrow", "alot" -> "a lot".
- Run-on words: "ismankesh" -> "is mankesh", "thequickbrown" -> "the quick brown".
- Wrong word forms with clear context: their/there/they're, your/you're, its/it's, then/than.
- Subject-verb agreement when clearly wrong ("he go" -> "he goes").
- Same name spelled two ways in this text: pick the version that appears first/most.
- Run-on sentences and comma splices ONLY when both clauses are clearly independent and the fix is obvious. Use the smallest possible span.

DO NOT FLAG:
- Stylistic choices, casual phrasing, contractions, fragments, casual sentence openers (these stay flagged for cap only — "yeah" at sentence start IS still "Yeah", but the choice to BE casual stays).
- Word choice or tone.
- Things that COULD be slang, brand names, or made-up words. Stay safe — skip those.
- Grammar judgment calls where you are not 90%+ confident. Skip them.

OUTPUT JSON:
{"issues": [{"original": "<exact substring>", "suggestion": "<fix>", "type": "spelling" | "grammar" | "capitalization"}]}

- "original" MUST be a verbatim substring of the input. Keep it as short as makes sense (single word for typos; clause-only for sentence-level fixes — never the whole sentence).
- No duplicates. If the same word appears multiple times wrong, list it once.
- If no clear errors, return {"issues": []}.
- Return only JSON. No commentary, no markdown.`;

function buildSystemPrompt() {
  const { corrections } = loadDict();
  const entries = Object.entries(corrections || {});
  if (entries.length === 0) {
    return grammarSystemPromptBase;
  }
  const recent = entries.slice(-50);
  const learnedSection = `\n\nLEARNED CORRECTIONS (use these when the EXACT "from" word appears):
${recent.map(([orig, sug]) => `- "${orig}" -> "${sug}"`).join("\n")}

Rules for using these:
1. If a "from" word appears in the input AS AN EXACT MATCH, suggest the corresponding "to" value as the fix. Do NOT also suggest a different correction (like capitalization) for the same word — the dictionary entry takes priority.
2. Do NOT apply these to similar-but-different words. "mukesh" is NOT "munkesh" — leave it alone.
3. If a "to" value appears in the input, that word is known-good — do NOT flag it as an error.`;
  return grammarSystemPromptBase + learnedSection;
}

async function checkGrammar(text) {
  if (!openrouterApiKey) {
    throw new Error("OPENROUTER_API_KEY missing");
  }

  const trimmed = text.trim();
  if (trimmed.length < 10 || trimmed.length > 5000) {
    return [];
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
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
          temperature: 0.0,
          max_tokens: 500,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: buildSystemPrompt() },
            { role: "user", content: trimmed },
          ],
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errPayload = await response.json().catch(() => null);
      console.error(
        "[grammar] API error:",
        errPayload?.error?.message || response.status,
      );
      return [];
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content?.trim() || "";

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[grammar] No JSON in response");
      return [];
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error("[grammar] JSON parse failed:", err.message);
      return [];
    }

    const rawIssues = Array.isArray(parsed?.issues) ? parsed.issues : [];

    const cleaned = [];
    for (const issue of rawIssues) {
      if (!issue || typeof issue !== "object") continue;
      const original = typeof issue.original === "string" ? issue.original : "";
      const suggestion =
        typeof issue.suggestion === "string" ? issue.suggestion : "";
      const type =
        issue.type === "spelling" ||
        issue.type === "grammar" ||
        issue.type === "capitalization"
          ? issue.type
          : "grammar";
      if (!original || !suggestion || original === suggestion) continue;
      if (!trimmed.includes(original)) continue;
      cleaned.push({ original, suggestion, type });
    }

    return cleaned;
  } catch (error) {
    if (error.name === "AbortError") {
      console.error("[grammar] Timed out");
    } else {
      console.error("[grammar] Failed:", error.message);
    }
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = { checkGrammar };
