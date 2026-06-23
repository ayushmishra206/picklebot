import assert from "node:assert/strict";
import test from "node:test";
import { planMatches } from "../src/core/planner.js";

test("plans matches across courts and rotates sit-outs", () => {
  const players = Array.from({ length: 9 }, (_, index) => ({
    id: `p${index + 1}`,
    displayName: `Player ${index + 1}`,
    skillTier: (index % 5) + 1
  }));

  const result = planMatches(players, { courtCount: 2, rounds: 3 });

  assert.equal(result.matches.length, 6);
  assert.equal(result.sitOuts.length, 3);
  assert.ok(result.sitOuts.every((round) => round.players.length === 1));
  assert.notEqual(result.sitOuts[0].players[0], result.sitOuts[1].players[0]);
});

test("requires four players", () => {
  const result = planMatches([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);

  assert.equal(result.matches.length, 0);
  assert.match(result.warning, /Need at least 4/);
});
