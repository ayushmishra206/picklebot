const RSVP_IN = new Set(["in", "+1", "yes", "join", "down"]);
const RSVP_OUT = new Set(["out", "-1", "no", "drop"]);
const CONDITIONAL_MARKERS = [
  " if ",
  " agar ",
  " agaar ",
  " agr ",
  " nahi hui",
  " jagah hai",
  " space is",
  " still available",
  " possible"
];

export function parseCommand(rawText) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { type: "empty" };
  }

  if (text.startsWith("!")) {
    return parseBangCommand(text);
  }

  const naturalGame = parseNaturalGame(text, lower);
  if (naturalGame) {
    return naturalGame;
  }

  const naturalCost = parseNaturalCost(lower);
  if (naturalCost) {
    return naturalCost;
  }

  if (isPaymentDone(lower)) {
    return parsePaymentDone(text);
  }

  const naturalRsvp = parseNaturalRsvp(text, lower);
  if (naturalRsvp) {
    return naturalRsvp;
  }

  if (RSVP_IN.has(lower)) {
    return { type: "rsvp", state: "confirmed", guestCount: 0 };
  }

  if (RSVP_OUT.has(lower)) {
    return { type: "rsvp", state: "out", guestCount: 0 };
  }

  if (lower === "confirm") {
    return { type: "rsvp", state: "confirmed", guestCount: 0 };
  }

  if (lower === "drop") {
    return { type: "rsvp", state: "out", guestCount: 0 };
  }

  return { type: "unknown" };
}

function parseBangCommand(text) {
  const parts = text.split(/\s+/);
  const command = parts[0].toLowerCase();

  if (command === "!game") {
    return parseGame(parts.slice(1));
  }

  if (command === "!roster") {
    return { type: "roster" };
  }

  if (command === "!plan") {
    return parsePlan(parts.slice(1));
  }

  if (command === "!costs") {
    return parseCosts(parts.slice(1));
  }

  if (command === "!settle") {
    return { type: "settle" };
  }

  if (command === "!close") {
    return { type: "close" };
  }

  if (command === "!skill") {
    return parseSkill(parts.slice(1));
  }

  if (command === "!upi") {
    return parseUpi(parts.slice(1));
  }

  return { type: "unknown_command", command };
}

function parseGame(parts) {
  if (parts.length === 0) {
    return { type: "invalid", reason: "Usage: !game <time> [courts N]" };
  }

  let courtCount = 1;
  const courtsIndex = parts.findIndex((part) => part.toLowerCase() === "courts");

  if (courtsIndex >= 0) {
    const parsedCourts = Number.parseInt(parts[courtsIndex + 1], 10);
    if (!Number.isInteger(parsedCourts) || parsedCourts < 1) {
      return { type: "invalid", reason: "Court count must be a positive number." };
    }
    courtCount = parsedCourts;
  }

  const timeParts = courtsIndex >= 0 ? parts.slice(0, courtsIndex) : parts;
  const startTime = timeParts.join(" ");

  if (!startTime) {
    return { type: "invalid", reason: "Usage: !game <time> [courts N]" };
  }

  return { type: "game", startTime, courtCount };
}

function parseNaturalGame(text, lower) {
  if (lower.includes("community game") || lower.includes("dupr")) {
    return null;
  }

  const looksLikeGamePrompt = [
    /\bgame\s+(today|aaj|evening)\b/i,
    /^\s*(today|aaj)\s*\?*\.?\s*$/i,
    /\bany\s*game\s+(today|aaj)\b/i,
    /\banyone\s+(playing\s+)?(today|aaj)\b/i,
    /\bwho\s+is\s+in\s+for\s+(today|aaj)\b/i,
    /\bkhelna\s+hai\s+(aaj|shaam|evening)\b/i,
    /\b(aaj|shaam)\s+khelna\s+hai\b/i,
    /\bkoi\s+(today|aaj)\b/i
  ].some((pattern) => pattern.test(text));

  if (!looksLikeGamePrompt) {
    return null;
  }

  return {
    type: "game",
    startTime: extractTimeWindow(text) ?? "today TBD",
    courtCount: extractCourtCount(text) ?? 1,
    inferred: true
  };
}

function parseNaturalCost(lower) {
  const match = lower.match(/\b(\d+(?:\.\d+)?)\s*(?:\/-\s*)?(?:\/\s*)?(?:pp|per\s*person|person|each)\b/i);
  if (!match) {
    return null;
  }

  return {
    type: "per_person_cost",
    amountPerPerson: Number.parseFloat(match[1]),
    label: "court"
  };
}

function parseNaturalRsvp(text, lower) {
  const inMessage = isInMessage(lower);
  const conditional = isConditional(lower);
  const outMessage = isOutMessage(lower);

  if (outMessage && !(inMessage && conditional)) {
    return { type: "rsvp", state: "out", guestCount: 0 };
  }

  if (!inMessage) {
    return null;
  }

  return {
    type: "rsvp",
    state: conditional ? "interested" : "confirmed",
    condition: conditional ? extractCondition(text) : undefined,
    guestCount: extractGuestCount(lower)
  };
}

function parsePlan(parts) {
  let mode = "round-robin";
  const modeIndex = parts.findIndex((part) => part.toLowerCase() === "mode");
  if (modeIndex >= 0 && parts[modeIndex + 1]) {
    const requestedMode = parts[modeIndex + 1].toLowerCase();
    if (["random", "round-robin", "balanced", "rating-balanced"].includes(requestedMode)) {
      mode = requestedMode === "balanced" ? "rating-balanced" : requestedMode;
    }
  }

  return { type: "plan", mode };
}

function parseCosts(parts) {
  const paidIndex = parts.findIndex((part) => part.toLowerCase() === "paid");
  if (paidIndex <= 0 || paidIndex === parts.length - 1) {
    return { type: "invalid", reason: "Usage: !costs <label amount...> paid <name> [method equal|weighted]" };
  }

  const methodIndex = parts.findIndex((part) => part.toLowerCase() === "method");
  const payerEnd = methodIndex > paidIndex ? methodIndex : parts.length;
  const paidByName = parts.slice(paidIndex + 1, payerEnd).join(" ").trim();
  const method = methodIndex >= 0 && parts[methodIndex + 1] === "weighted" ? "weighted" : "equal";
  const itemParts = parts.slice(0, paidIndex);

  if (itemParts.length % 2 !== 0) {
    return { type: "invalid", reason: "Costs must be label/amount pairs, e.g. court 800 shuttles 400." };
  }

  const items = [];
  for (let index = 0; index < itemParts.length; index += 2) {
    const label = itemParts[index];
    const amount = Number.parseFloat(itemParts[index + 1]);
    if (!label || !Number.isFinite(amount) || amount <= 0) {
      return { type: "invalid", reason: `Invalid cost item near "${itemParts.slice(index, index + 2).join(" ")}".` };
    }
    items.push({ label, amount });
  }

  return { type: "costs", items, paidByName, method };
}

function parseSkill(parts) {
  if (parts.length < 2) {
    return { type: "invalid", reason: "Usage: !skill <name> <tier>" };
  }

  const tier = Number.parseInt(parts.at(-1), 10);
  if (!Number.isInteger(tier) || tier < 1 || tier > 5) {
    return { type: "invalid", reason: "Skill tier must be a number from 1 to 5." };
  }

  return { type: "skill", name: parts.slice(0, -1).join(" "), tier };
}

function parseUpi(parts) {
  if (parts.length === 0 || !parts.at(-1).includes("@")) {
    return { type: "invalid", reason: "Usage: !upi <handle>" };
  }

  return { type: "upi", handle: parts.at(-1) };
}

function isInMessage(lower) {
  return [
    /\b(in|join|joining|down|yes|yess|aajaunga|aaunga|aa jaunga|aa sakta|can play|i can play|i m in|i'm in|im in|i am in)\b/i,
    /^\+(\d+)$/,
    /\bin\s*\+\d+\b/i,
    /\bi\s+have\s+\d+\s+more\s+in\b/i
  ].some((pattern) => pattern.test(lower));
}

function isOutMessage(lower) {
  return [
    /\bout\b/i,
    /\bskip\b/i,
    /\bdrop\b/i,
    /\bnot\s+possible\b/i,
    /\bwon'?t\s+be\s+able\b/i,
    /\bcannot\s+(come|join|play)\b/i,
    /\bcan't\s+(come|join|play)\b/i,
    /\bnahi\s+(aa|a)\s*sakta\b/i,
    /\bnahi\s+(aa|a)\s*paunga\b/i,
    /\bmushkil\s+hai\b/i,
    /\bnah[iy]\b/i
  ].some((pattern) => pattern.test(lower));
}

function isConditional(lower) {
  return CONDITIONAL_MARKERS.some((marker) => lower.includes(marker));
}

function extractCondition(text) {
  const match = text.match(/\b(if|agar|agaar|agr)\b(.+)$/i);
  return match ? match[0].trim() : text.trim();
}

function extractGuestCount(lower) {
  const plusMatch = lower.match(/\bin\s*\+(\d+)\b|^\+(\d+)$/i);
  if (plusMatch) {
    return Number.parseInt(plusMatch[1] ?? plusMatch[2], 10);
  }

  const moreMatch = lower.match(/\bi\s+have\s+(\d+)\s+more\s+in\b/i);
  if (moreMatch) {
    return Number.parseInt(moreMatch[1], 10);
  }

  return 0;
}

function extractTimeWindow(text) {
  const match = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|to|se)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
  if (match) {
    return `${match[1].trim()}-${match[2].trim()}`;
  }

  const singleTime = text.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  return singleTime ? singleTime[1].trim() : null;
}

function extractCourtCount(text) {
  const match = text.match(/\b(?:courts?|court)\s*(\d+)\b/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function isPaymentDone(lower) {
  return /\b(done|paid|sent|transfer(?:red)?)\b/i.test(lower);
}

function parsePaymentDone(text) {
  const amount = text.match(/(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)/i);
  return {
    type: "payment_done",
    amount: amount ? Number.parseFloat(amount[1]) : undefined,
    guestCount: extractGuestCount(text.toLowerCase())
  };
}
