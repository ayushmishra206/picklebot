import assert from "node:assert/strict";
import test from "node:test";
import { calculateSettlement } from "../src/core/settlement.js";

test("splits equal costs and nets transfers", () => {
  const players = {
    ayush: { id: "ayush", displayName: "Ayush" },
    priya: { id: "priya", displayName: "Priya" },
    rohan: { id: "rohan", displayName: "Rohan" },
    sara: { id: "sara", displayName: "Sara" }
  };
  const session = {
    rsvps: {
      ayush: { state: "confirmed" },
      priya: { state: "confirmed" },
      rohan: { state: "confirmed" },
      sara: { state: "confirmed" }
    },
    matches: [],
    costs: [
      { label: "court", amount: 800, paidBy: "ayush", splitMethod: "equal" }
    ]
  };

  const result = calculateSettlement(session, players);

  assert.equal(result.total, 800);
  assert.deepEqual(result.shares.map((share) => share.share), [200, 200, 200, 200]);
  assert.equal(result.transfers.length, 3);
  assert.ok(result.transfers.every((transfer) => transfer.toPlayer === "ayush"));
});

test("reimburses a payer who is not in the playing roster", () => {
  const players = {
    ayush: { id: "ayush", displayName: "Ayush" },
    priya: { id: "priya", displayName: "Priya" },
    rohan: { id: "rohan", displayName: "Rohan" }
  };
  const session = {
    rsvps: {
      ayush: { state: "confirmed" },
      priya: { state: "confirmed" }
    },
    matches: [],
    costs: [
      { label: "court", amount: 400, paidBy: "rohan", splitMethod: "equal" }
    ]
  };

  const result = calculateSettlement(session, players);

  assert.deepEqual(
    result.shares.map((share) => [share.name, share.share, share.paid, share.net]),
    [
      ["Ayush", 200, 0, -200],
      ["Priya", 200, 0, -200],
      ["Rohan", 0, 400, 400]
    ]
  );
  assert.equal(result.transfers.length, 2);
  assert.ok(result.transfers.every((transfer) => transfer.toPlayer === "rohan"));
});
