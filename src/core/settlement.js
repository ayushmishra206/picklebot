import { countRoundsPlayed } from "./planner.js";

export function calculateSettlement(session, playersById) {
  const activePlayerIds = Object.entries(session.rsvps)
    .filter(([, rsvp]) => rsvp.state === "confirmed")
    .map(([playerId]) => playerId);

  if (activePlayerIds.length === 0) {
    return { total: 0, shares: [], transfers: [], warning: "No confirmed players to settle against." };
  }

  const total = session.costs.reduce((sum, cost) => sum + cost.amount, 0);
  const splitMethod = session.costs.at(-1)?.splitMethod ?? "equal";
  const weights = splitMethod === "weighted"
    ? weightedByRounds(activePlayerIds, session.matches)
    : equalWeights(activePlayerIds);

  const totalWeight = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  const paidByPlayer = new Map();

  for (const cost of session.costs) {
    paidByPlayer.set(cost.paidBy, roundMoney((paidByPlayer.get(cost.paidBy) ?? 0) + cost.amount));
  }

  const shares = activePlayerIds.map((playerId) => {
    const owedShare = totalWeight === 0 ? 0 : roundMoney((weights.get(playerId) / totalWeight) * total);
    const paid = paidByPlayer.get(playerId) ?? 0;
    return {
      playerId,
      name: playersById[playerId]?.displayName ?? playerId,
      share: owedShare,
      paid,
      net: roundMoney(paid - owedShare),
      upiHandle: playersById[playerId]?.upiHandle
    };
  });

  return {
    total,
    shares,
    transfers: minimizeTransfers(shares),
    splitMethod
  };
}

function equalWeights(playerIds) {
  return new Map(playerIds.map((playerId) => [playerId, 1]));
}

function weightedByRounds(playerIds, matches) {
  const roundsPlayed = countRoundsPlayed(matches);
  return new Map(playerIds.map((playerId) => [playerId, Math.max(1, roundsPlayed.get(playerId) ?? 1)]));
}

function minimizeTransfers(shares) {
  const debtors = shares
    .filter((share) => share.net < 0)
    .map((share) => ({ ...share, amount: roundMoney(Math.abs(share.net)) }))
    .sort((a, b) => b.amount - a.amount);
  const creditors = shares
    .filter((share) => share.net > 0)
    .map((share) => ({ ...share, amount: roundMoney(share.net) }))
    .sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = roundMoney(Math.min(debtor.amount, creditor.amount));

    if (amount > 0) {
      transfers.push({
        fromPlayer: debtor.playerId,
        fromName: debtor.name,
        toPlayer: creditor.playerId,
        toName: creditor.name,
        amount,
        toUpiHandle: creditor.upiHandle
      });
    }

    debtor.amount = roundMoney(debtor.amount - amount);
    creditor.amount = roundMoney(creditor.amount - amount);

    if (debtor.amount === 0) {
      debtorIndex += 1;
    }
    if (creditor.amount === 0) {
      creditorIndex += 1;
    }
  }

  return transfers;
}

export function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
