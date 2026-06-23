const RSVP_IN = new Set(["in", "+1", "yes", "join"]);
const RSVP_OUT = new Set(["out", "-1", "no"]);

export function parseCommand(rawText) {
  const text = rawText.trim();
  const lower = text.toLowerCase();

  if (!text) {
    return { type: "empty" };
  }

  if (RSVP_IN.has(lower)) {
    return { type: "rsvp", state: "interested" };
  }

  if (RSVP_OUT.has(lower)) {
    return { type: "rsvp", state: "out" };
  }

  if (lower === "confirm") {
    return { type: "rsvp", state: "confirmed" };
  }

  if (lower === "drop") {
    return { type: "rsvp", state: "out" };
  }

  if (!text.startsWith("!")) {
    return { type: "unknown" };
  }

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
