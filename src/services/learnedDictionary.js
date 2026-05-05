const fs = require("fs");
const path = require("path");

const dataDir = path.resolve(__dirname, "..", "..", "data");
const dictFile = path.join(dataDir, "learned_corrections.json");

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadDict() {
  try {
    ensureDataDir();
    if (!fs.existsSync(dictFile)) {
      return { corrections: {} };
    }
    const raw = fs.readFileSync(dictFile, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      corrections:
        parsed && typeof parsed.corrections === "object" && parsed.corrections
          ? parsed.corrections
          : {},
    };
  } catch (err) {
    console.error("[dict] load failed:", err.message);
    return { corrections: {} };
  }
}

function saveCorrection(original, suggestion) {
  if (typeof original !== "string" || typeof suggestion !== "string") {
    return false;
  }
  const o = original.trim();
  const s = suggestion.trim();
  if (!o || !s || o === s) return false;
  if (o.length > 200 || s.length > 200) return false;

  try {
    const dict = loadDict();
    dict.corrections[o] = s;

    const entries = Object.entries(dict.corrections);
    if (entries.length > 500) {
      const trimmed = entries.slice(-500);
      dict.corrections = Object.fromEntries(trimmed);
    }

    ensureDataDir();
    fs.writeFileSync(dictFile, JSON.stringify(dict, null, 2), "utf-8");
    console.log(`[dict] saved correction "${o}" -> "${s}"`);
    return true;
  } catch (err) {
    console.error("[dict] save failed:", err.message);
    return false;
  }
}

module.exports = { loadDict, saveCorrection };
