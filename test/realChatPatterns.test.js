import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand } from "../src/core/commandParser.js";
import { PicklePilotEngine, createInitialState } from "../src/core/engine.js";

class MemoryStore {
  constructor() {
    this.state = createInitialState();
  }

  async load() {
    return this.state;
  }

  async save(state) {
    this.state = state;
  }
}

test("parses natural game prompts from real chat", () => {
  assert.deepEqual(parseCommand("Game today 7 to 8?"), {
    type: "game",
    startTime: "7-8",
    courtCount: 1,
    inferred: true
  });

  assert.equal(parseCommand("Anyone playing today??").type, "game");
  assert.equal(parseCommand("Khelna hai aaj?").type, "game");
});

test("parses guests, conditional RSVPs, hinglish out, costs, and payment done", () => {
  assert.deepEqual(parseCommand("In +1 6-7:30"), {
    type: "rsvp",
    state: "confirmed",
    condition: undefined,
    guestCount: 1
  });

  assert.deepEqual(parseCommand("In agar rain nahi hui"), {
    type: "rsvp",
    state: "interested",
    condition: "agar rain nahi hui",
    guestCount: 0
  });

  assert.equal(parseCommand("Main out hun").state, "out");
  assert.equal(parseCommand("Nahi aa sakta").state, "out");
  assert.deepEqual(parseCommand("180PP"), {
    type: "per_person_cost",
    amountPerPerson: 180,
    label: "court"
  });
  assert.equal(parseCommand("Done").type, "payment_done");
});

test("handles a natural chat flow with guest count and per-person cost", async () => {
  const store = new MemoryStore();
  const engine = new PicklePilotEngine(store);
  const send = (senderName, text) => engine.handleMessage({
    groupId: "g1",
    senderId: senderName.toLowerCase().replace(/\s+/g, "-"),
    senderName,
    text
  });

  let responses = await send("Rohan", "Game today 7 to 8?");
  assert.match(responses[0].text, /Game opened for 7-8/);

  await send("Ayush", "In +1");
  await send("Priya", "In");
  await send("Sara", "In agar rain nahi hui");

  responses = await send("Rohan", "!roster");
  assert.match(responses[0].text, /Confirmed: Ayush, Ayush \+1, Priya/);
  assert.match(responses[0].text, /Tentative: Sara \(agar rain nahi hui\)/);

  responses = await send("Rohan", "200/ person tha");
  assert.match(responses[0].text, /Recorded ₹200 each for 3 players/);

  responses = await send("Ayush", "Done");
  assert.match(responses[0].text, /Marked paid: Ayush/);

  responses = await send("Rohan", "!settle");
  assert.match(responses[0].text, /Session total: ₹600/);
  assert.match(responses[0].text, /Marked paid: Ayush/);
});
