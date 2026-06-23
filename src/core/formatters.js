export function formatRoster(session, playersById) {
  const groups = {
    confirmed: [],
    interested: [],
    waitlisted: [],
    out: []
  };

  for (const [playerId, rsvp] of Object.entries(session.rsvps)) {
    const name = playersById[playerId]?.displayName ?? playerId;
    groups[rsvp.state]?.push(rsvp.condition ? `${name} (${rsvp.condition})` : name);
  }

  return [
    `Roster for ${session.startTime}`,
    `Confirmed: ${formatNames(groups.confirmed)}`,
    `Tentative: ${formatNames(groups.interested)}`,
    `Waitlisted: ${formatNames(groups.waitlisted)}`,
    `Out: ${formatNames(groups.out)}`
  ].join("\n");
}

export function formatPlan(session, playersById) {
  if (session.matches.length === 0) {
    return "No matches planned yet.";
  }

  const lines = [`Schedule for ${session.startTime}`];
  let currentRound = null;

  for (const match of session.matches) {
    if (match.round !== currentRound) {
      currentRound = match.round;
      const sitOut = session.sitOuts.find((entry) => entry.round === currentRound)?.players ?? [];
      lines.push(`Round ${currentRound}${sitOut.length > 0 ? ` | Sitting out: ${formatPlayerIds(sitOut, playersById)}` : ""}`);
    }

    lines.push(`Court ${match.court}: ${formatTeam(match.teamA, playersById)} vs ${formatTeam(match.teamB, playersById)}`);
  }

  return lines.join("\n");
}

export function formatSettlement(result, session) {
  if (result.warning) {
    return result.warning;
  }

  const itemizedCosts = session.costs.map((cost) => `${cost.label} ₹${cost.amount}`).join(", ");
  const lines = [
    `Session total: ₹${result.total} (${itemizedCosts})`,
    `Split method: ${result.splitMethod}`,
    "Per person:"
  ];

  for (const share of result.shares) {
    const status = share.net >= 0 ? `is owed ₹${share.net}` : `owes ₹${Math.abs(share.net)}`;
    lines.push(`${share.name}: share ₹${share.share}, paid ₹${share.paid} -> ${status}`);
  }

  if (result.transfers.length === 0) {
    lines.push("No transfers needed.");
  } else {
    lines.push("Settle:");
    for (const transfer of result.transfers) {
      const handle = transfer.toUpiHandle ? ` (${transfer.toUpiHandle})` : "";
      lines.push(`${transfer.fromName} -> ${transfer.toName}${handle}: ₹${transfer.amount}`);
    }
  }

  const paidNames = Object.keys(session.paymentConfirmations ?? {})
    .map((playerId) => result.shares.find((share) => share.playerId === playerId)?.name)
    .filter(Boolean);
  if (paidNames.length > 0) {
    lines.push(`Marked paid: ${paidNames.join(", ")}`);
  }

  return lines.join("\n");
}

function formatNames(names) {
  return names.length > 0 ? names.join(", ") : "-";
}

function formatTeam(playerIds, playersById) {
  return formatPlayerIds(playerIds, playersById).replace(", ", " + ");
}

function formatPlayerIds(playerIds, playersById) {
  return playerIds.map((playerId) => playersById[playerId]?.displayName ?? playerId).join(", ");
}
