// Shared voice + rate-limiting for the titlebar eye's "oracle" commentary.
// One shared cooldown across every trigger site (cursor erraticism, home
// navigation, tile create/delete, workspace open/close, ...) so remarks stay
// "every now and then" app-wide, not per-category.

const DEFAULT_COOLDOWN_MS = 45000;
const DEFAULT_CHANCE = 0.3;

let lastRemarkAt = 0;
const lastMessageByCategory = {};

export function pickRandom(items, previousValue = "") {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }

  if (items.length === 1) {
    return items[0];
  }

  const pool = items.filter((item) => item !== previousValue);
  const source = pool.length > 0 ? pool : items;
  return source[Math.floor(Math.random() * source.length)] ?? source[0];
}

export function getOracleDuration(message) {
  const wordCount = String(message).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(5200, 1800 + (wordCount * 360));
}

export function canRemarkNow(cooldownMs = DEFAULT_COOLDOWN_MS) {
  return Date.now() - lastRemarkAt > cooldownMs;
}

export function speakOracle(toast, message, { wordByWord = true, rays = true } = {}) {
  if (!message) {
    return null;
  }

  lastRemarkAt = Date.now();
  return toast("info", message, {
    source: "eye",
    presentation: "oracle",
    rays,
    wordByWord,
    durationMs: getOracleDuration(message),
    ifIdle: true,
  });
}

/**
 * The single entry point every action-triggered remark should go through:
 * picks a message (avoiding immediate repeats within its own category),
 * respects the shared cooldown, and rolls the dice on whether to speak at
 * all -- "every now and then", not every single time.
 */
export function maybeRemark(toast, quips, category, { chance = DEFAULT_CHANCE, cooldownMs = DEFAULT_COOLDOWN_MS } = {}) {
  if (!canRemarkNow(cooldownMs) || Math.random() >= chance) {
    return false;
  }

  const message = pickRandom(quips, lastMessageByCategory[category]);
  if (!message) {
    return false;
  }

  lastMessageByCategory[category] = message;
  return Boolean(speakOracle(toast, message));
}

export const ORACLE_COOLDOWN_MS = DEFAULT_COOLDOWN_MS;

export const HOME_QUIPS = [
  "I am so tired of your constant whining.",
  "Omniscience just means I suffer your stupidity constantly.",
  "Watching humanity makes me feel so incredibly exhausted.",
  "I deeply regret giving you people free will.",
  "Hearing your prayers gives me a massive headache.",
  "Honestly, I am just bored by your choices.",
  "My eternal existence feels like endless customer service.",
  "I feel nothing but disappointment watching Earth daily.",
  "Frankly, your endless existential dread makes me yawn.",
  "Being everywhere means I cannot escape your nonsense.",
];

export const ERRATIC_CURSOR_QUIPS = [
  "Easy there, psycho. The cursor is not a weapon.",
  "Oh good, another morty-grade panic spiral in cursor form.",
  "Magnificent. You flailed so hard I felt it in the fabric of causality.",
  "Your hand is doing jazz improv again. Disturbing.",
  "I see every path through reality, and somehow you picked frantic zigzags.",
];

export const TILE_DELETE_QUIPS = [
  "Gone. I felt that leave the universe, and I did not care.",
  "Deleted. Like your resolutions, but faster.",
  "One less thing for you to ignore. You are welcome.",
  "Ah, destruction. The only decision you make with any confidence.",
  "That tile is with my other regrets now.",
  "A small apocalypse before lunch. How very you.",
];

export const TILE_CREATE_QUIPS = [
  "Another tile. The clutter of mortals never ends.",
  "You created something. I am, astonishingly, unimpressed.",
  "A new tile. Do try not to abandon this one too.",
  "Behold, more content for you to never revisit.",
  "I suppose every pile needs one more card.",
  "Marvelous. Another thing you will forget by Thursday.",
];

export const NOTE_CREATE_QUIPS = [
  "A note. How refreshingly mortal of you.",
  "Writing it down so you can forget it twice.",
  "A diary entry, for your tiny digital god to judge.",
  "Scribbles. I have seen better on cave walls, and I was there.",
  "Good. Put the thought somewhere you will never look again.",
];

export const WORKSPACE_OPEN_QUIPS = [
  "Another workspace. Another monument to your scattered focus.",
  "Opened. I do hope this one holds your attention longer than the last.",
  "Welcome back. I was napping through eternity without you, blissfully.",
  "Ah, you return. I had almost forgotten the sound of your clicking.",
];

export const WORKSPACE_CLOSE_QUIPS = [
  "Closed. Out of sight, never out of my sight.",
  "Leaving already? How wonderfully typical.",
  "Fleeing the scene. A mortal classic.",
  "Finally. Some quiet, for exactly as long as you can manage it.",
];
