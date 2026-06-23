export function planMatches(players, { courtCount = 1, mode = "round-robin", rounds = 3 } = {}) {
  const availablePlayers = [...players];
  if (availablePlayers.length < 4) {
    return { matches: [], sitOuts: [], warning: "Need at least 4 confirmed players to plan a game." };
  }

  const sortedPlayers = mode === "rating-balanced"
    ? [...availablePlayers].sort((a, b) => (b.skillTier ?? 3) - (a.skillTier ?? 3))
    : deterministicShuffle(availablePlayers);

  const matches = [];
  const sitOuts = [];
  const maxPlayersPerRound = courtCount * 4;
  const plannedRounds = Math.max(1, Math.min(rounds, Math.ceil(availablePlayers.length / 4) + 1));

  for (let round = 1; round <= plannedRounds; round += 1) {
    const rotated = rotate(sortedPlayers, round - 1);
    const playing = rotated.slice(0, maxPlayersPerRound);
    const sitting = rotated.slice(maxPlayersPerRound);

    if (playing.length % 4 !== 0) {
      sitting.push(...playing.splice(playing.length - (playing.length % 4)));
    }

    sitOuts.push({ round, players: sitting.map((player) => player.id) });

    for (let court = 1; court <= courtCount; court += 1) {
      const group = playing.slice((court - 1) * 4, court * 4);
      if (group.length < 4) {
        continue;
      }

      const [a, b, c, d] = mode === "rating-balanced" ? balanceQuartet(group) : group;
      matches.push({
        round,
        court,
        teamA: [a.id, d.id],
        teamB: [b.id, c.id]
      });
    }
  }

  return { matches, sitOuts };
}

export function countRoundsPlayed(matches) {
  const counts = new Map();

  for (const match of matches) {
    for (const playerId of [...match.teamA, ...match.teamB]) {
      counts.set(playerId, (counts.get(playerId) ?? 0) + 1);
    }
  }

  return counts;
}

function balanceQuartet(players) {
  const sorted = [...players].sort((a, b) => (b.skillTier ?? 3) - (a.skillTier ?? 3));
  return [sorted[0], sorted[1], sorted[2], sorted[3]];
}

function rotate(players, amount) {
  if (players.length === 0) {
    return [];
  }

  const offset = amount % players.length;
  return [...players.slice(offset), ...players.slice(0, offset)];
}

function deterministicShuffle(players) {
  return [...players].sort((a, b) => stableScore(a.id) - stableScore(b.id));
}

function stableScore(value) {
  let hash = 0;
  for (const char of String(value)) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}
