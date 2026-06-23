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
