import { randomUUID } from "node:crypto";
import { parseCommand } from "./commandParser.js";
import { formatPlan, formatRoster, formatSettlement } from "./formatters.js";
import { planMatches } from "./planner.js";
import { calculateSettlement } from "./settlement.js";

const SESSION_STATUSES = {
  OPEN: "open",
  PLANNED: "planned",
  CLOSED: "closed"
};

export class PicklePilotEngine {
  constructor(store) {
    this.store = store;
  }

  async handleMessage(message) {
    const state = await this.store.load();
    const command = parseCommand(message.text);
    const responses = [];

    if (command.type === "empty" || command.type === "unknown") {
      return responses;
    }

    if (command.type === "invalid") {
      return [groupReply(message, command.reason)];
    }

    if (command.type === "unknown_command") {
      return [groupReply(message, `I do not know ${command.command} yet.`)];
    }

    ensurePlayer(state, message.senderId, message.senderName);

    switch (command.type) {
      case "game":
        responses.push(this.startSession(state, message, command));
        break;
      case "rsvp":
        responses.push(...this.updateRsvp(state, message, command));
        break;
      case "roster":
        responses.push(this.postRoster(state, message));
        break;
      case "plan":
        responses.push(...this.planSession(state, message, command.mode));
        break;
      case "costs":
        responses.push(...this.addCosts(state, message, command));
        break;
      case "per_person_cost":
        responses.push(...this.addPerPersonCost(state, message, command));
        break;
      case "settle":
        responses.push(this.postSettlement(state, message));
        break;
      case "payment_done":
        responses.push(...this.recordPaymentDone(state, message, command));
        break;
      case "close":
        responses.push(this.closeSession(state, message));
        break;
      case "skill":
        responses.push(this.setSkill(state, message, command));
        break;
      case "upi":
        responses.push(this.setUpi(state, message, command));
        break;
      default:
        break;
    }

    await this.store.save(state);
    return responses.filter(Boolean);
  }

  startSession(state, message, command) {
    const activeSession = findActiveSession(state, message.groupId);
    if (activeSession) {
      return groupReply(message, `A session is already open for ${activeSession.startTime}. Use !close before starting another one.`);
    }

    const session = {
      id: randomUUID(),
      groupId: message.groupId,
      startTime: command.startTime,
      courtCount: command.courtCount,
      status: SESSION_STATUSES.OPEN,
      createdBy: message.senderId,
      createdAt: new Date().toISOString(),
      rsvps: {},
      matches: [],
      sitOuts: [],
      costs: [],
      paymentConfirmations: {}
    };

    state.sessions.push(session);

    return groupReply(
      message,
      `Game opened for ${session.startTime} on ${session.courtCount} court${session.courtCount === 1 ? "" : "s"}.\nReply "in" or "+1" to join.`
    );
  }

  updateRsvp(state, message, command) {
    const session = findActiveSession(state, message.groupId);
    if (!session) {
      return [groupReply(message, "No open game yet. Start one with !game <time> [courts N].")];
    }

    const player = state.players[message.senderId];
    const requestedState = command.state;
    const previousState = session.rsvps[player.id]?.state;
    const stateToApply = normalizeRsvpState(session, requestedState);
    session.rsvps[player.id] = {
      state: stateToApply,
      timestamp: new Date().toISOString(),
      condition: command.condition
    };
    const guestSummary = syncGuestsForRsvp(state, session, player, command);

    const roster = summarizeRoster(session);
    const suffix = stateToApply === "waitlisted" ? " You are on the waitlist for now." : "";
    const condition = command.condition ? ` (${command.condition})` : "";
    const alert = roster.confirmed < 4 && requestedState === "out"
      ? "\nHeads up: confirmed count is below the 4-player minimum."
      : "";
    const promotedPlayer = previousState === "confirmed" && requestedState === "out"
      ? promoteNextWaitlisted(session, state.players)
      : null;
    const promotion = promotedPlayer ? `\n${promotedPlayer.displayName} has been promoted from the waitlist.` : "";

    return [
      groupReply(message, `${player.displayName}: ${stateToApply}${condition}.${suffix}${guestSummary}${promotion}${alert}`)
    ];
  }

  postRoster(state, message) {
    const session = findActiveSession(state, message.groupId);
    if (!session) {
      return groupReply(message, "No open game yet.");
    }

    return groupReply(message, formatRoster(session, state.players));
  }

  planSession(state, message, mode) {
    const session = findActiveSession(state, message.groupId);
    if (!session) {
      return [groupReply(message, "No open game yet.")];
    }

    const confirmedPlayers = Object.entries(session.rsvps)
      .filter(([, rsvp]) => rsvp.state === "confirmed")
      .map(([playerId]) => state.players[playerId]);

    const result = planMatches(confirmedPlayers, {
      courtCount: session.courtCount,
      mode,
      rounds: 3
    });

    if (result.warning) {
      return [groupReply(message, result.warning)];
    }

    session.matches = result.matches;
    session.sitOuts = result.sitOuts;
    session.status = SESSION_STATUSES.PLANNED;

    return [groupReply(message, formatPlan(session, state.players))];
  }

  addCosts(state, message, command) {
    const session = findActiveSession(state, message.groupId);
    if (!session) {
      return [groupReply(message, "No open game yet.")];
    }

    const paidBy = findPlayerByName(state, command.paidByName);
    if (!paidBy) {
      return [groupReply(message, `I could not find payer "${command.paidByName}" in this group yet.`)];
    }

    for (const item of command.items) {
      session.costs.push({
        id: randomUUID(),
        label: item.label,
        amount: item.amount,
        paidBy: paidBy.id,
        splitMethod: command.method
      });
    }

    const total = command.items.reduce((sum, item) => sum + item.amount, 0);
    return [groupReply(message, `Recorded ₹${total} paid by ${paidBy.displayName}. Use !settle to post the split.`)];
  }

  addPerPersonCost(state, message, command) {
    const session = findActiveSession(state, message.groupId);
    if (!session) {
      return [];
    }

    const activePlayerIds = getActivePlayerIds(session);
    if (activePlayerIds.length === 0) {
      return [groupReply(message, "I saw the per-person cost, but there are no confirmed players yet.")];
    }

    const paidBy = state.players[message.senderId];
    const total = command.amountPerPerson * activePlayerIds.length;
    session.costs.push({
      id: randomUUID(),
      label: command.label,
      amount: total,
      paidBy: paidBy.id,
      splitMethod: "equal",
      amountPerPerson: command.amountPerPerson
    });

    return [
      groupReply(message, `Recorded ₹${command.amountPerPerson} each for ${activePlayerIds.length} players, paid by ${paidBy.displayName}.`)
    ];
  }

  postSettlement(state, message) {
    const session = findActiveSession(state, message.groupId);
    if (!session) {
      return groupReply(message, "No open game yet.");
    }

    if (session.costs.length === 0) {
      return groupReply(message, "No costs recorded yet. Use !costs <label amount...> paid <name>.");
    }

    return groupReply(message, formatSettlement(calculateSettlement(session, state.players), session));
  }

  closeSession(state, message) {
    const session = findActiveSession(state, message.groupId);
    if (!session) {
      return groupReply(message, "No open game to close.");
    }

    session.status = SESSION_STATUSES.CLOSED;
    return groupReply(message, `Closed the ${session.startTime} session.`);
  }

  setSkill(state, message, command) {
    const player = findPlayerByName(state, command.name);
    if (!player) {
      return groupReply(message, `I could not find "${command.name}" yet.`);
    }

    player.skillTier = command.tier;
    return groupReply(message, `${player.displayName} skill tier set to ${command.tier}.`);
  }

  setUpi(state, message, command) {
    const player = state.players[message.senderId];
    player.upiHandle = command.handle;
    return groupReply(message, `${player.displayName} UPI handle saved.`);
  }

  recordPaymentDone(state, message, command) {
    const session = findActiveSession(state, message.groupId);
    if (!session || session.costs.length === 0) {
      return [];
    }

    session.paymentConfirmations ??= {};
    const player = state.players[message.senderId];
    const playerIds = [
      player.id,
      ...getGuestIdsForOwner(state, player.id).slice(0, command.guestCount ?? 0)
    ];

    for (const playerId of playerIds) {
      session.paymentConfirmations[playerId] = {
        amount: command.amount,
        timestamp: new Date().toISOString()
      };
    }

    const names = playerIds.map((playerId) => state.players[playerId]?.displayName ?? playerId).join(", ");
    return [groupReply(message, `Marked paid: ${names}.`)];
  }
}

export function createInitialState() {
  return {
    players: {},
    sessions: []
  };
}

function ensurePlayer(state, senderId, senderName) {
  if (!state.players[senderId]) {
    state.players[senderId] = {
      id: senderId,
      displayName: senderName,
      skillTier: 3
    };
  } else if (senderName && state.players[senderId].displayName !== senderName) {
    state.players[senderId].displayName = senderName;
  }
}

function syncGuestsForRsvp(state, session, owner, command) {
  const existingGuestIds = getGuestIdsForOwner(state, owner.id);

  if (command.state === "out") {
    for (const guestId of existingGuestIds) {
      session.rsvps[guestId] = {
        state: "out",
        timestamp: new Date().toISOString()
      };
    }
    return existingGuestIds.length > 0 ? ` Guests also marked out: ${existingGuestIds.length}.` : "";
  }

  const guestCount = command.guestCount ?? 0;
  if (guestCount === 0) {
    return "";
  }

  const guestNames = [];
  for (let index = 1; index <= guestCount; index += 1) {
    const guestId = `${owner.id}:guest:${index}`;
    state.players[guestId] ??= {
      id: guestId,
      displayName: `${owner.displayName} +${index}`,
      skillTier: owner.skillTier ?? 3,
      guestOf: owner.id
    };

    const stateToApply = normalizeRsvpState(session, command.state);
    session.rsvps[guestId] = {
      state: stateToApply,
      timestamp: new Date().toISOString(),
      condition: command.condition
    };
    guestNames.push(`${state.players[guestId].displayName}: ${stateToApply}`);
  }

  return guestNames.length > 0 ? ` Guests: ${guestNames.join(", ")}.` : "";
}

function getGuestIdsForOwner(state, ownerId) {
  return Object.values(state.players)
    .filter((player) => player.guestOf === ownerId)
    .map((player) => player.id)
    .sort();
}

function findActiveSession(state, groupId) {
  return [...state.sessions]
    .reverse()
    .find((session) => session.groupId === groupId && session.status !== SESSION_STATUSES.CLOSED);
}

function getActivePlayerIds(session) {
  return Object.entries(session.rsvps)
    .filter(([, rsvp]) => rsvp.state === "confirmed")
    .map(([playerId]) => playerId);
}

function normalizeRsvpState(session, requestedState) {
  if (requestedState !== "confirmed") {
    return requestedState;
  }

  const capacity = session.courtCount * 4;
  const confirmedCount = Object.values(session.rsvps).filter((rsvp) => rsvp.state === "confirmed").length;
  return confirmedCount >= capacity ? "waitlisted" : "confirmed";
}

function summarizeRoster(session) {
  return Object.values(session.rsvps).reduce((summary, rsvp) => {
    summary[rsvp.state] = (summary[rsvp.state] ?? 0) + 1;
    return summary;
  }, {});
}

function promoteNextWaitlisted(session, playersById) {
  const nextEntry = Object.entries(session.rsvps)
    .filter(([, rsvp]) => rsvp.state === "waitlisted")
    .sort(([, first], [, second]) => first.timestamp.localeCompare(second.timestamp))
    .at(0);

  if (!nextEntry) {
    return null;
  }

  const [playerId, rsvp] = nextEntry;
  rsvp.state = "confirmed";
  rsvp.timestamp = new Date().toISOString();
  return playersById[playerId] ?? { displayName: playerId };
}

function findPlayerByName(state, name) {
  const normalizedName = name.trim().toLowerCase();
  return Object.values(state.players).find((player) => player.displayName.toLowerCase() === normalizedName);
}

function groupReply(message, text) {
  return {
    target: "group",
    groupId: message.groupId,
    text
  };
}
