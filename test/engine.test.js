import assert from "node:assert/strict";
import test from "node:test";
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

test("runs core session flow", async () => {
  const store = new MemoryStore();
  const engine = new PicklePilotEngine(store);
  const send = (senderName, text) => engine.handleMessage({
    groupId: "g1",
    senderId: senderName.toLowerCase(),
    senderName,
    text
  });

  let responses = await send("Ayush", "!game 6pm courts 1");
  assert.match(responses[0].text, /Game opened/);

  for (const name of ["Ayush", "Priya", "Rohan", "Sara"]) {
    await send(name, "confirm");
  }

  responses = await send("Ayush", "!plan");
  assert.match(responses[0].text, /Schedule/);

  responses = await send("Ayush", "!costs court 800 paid Ayush");
  assert.match(responses[0].text, /Recorded/);

  responses = await send("Priya", "!settle");
  assert.match(responses[0].text, /Priya -> Ayush/);
});

test("promotes waitlisted player when a confirmed player drops", async () => {
  const store = new MemoryStore();
  const engine = new PicklePilotEngine(store);
  const send = (senderName, text) => engine.handleMessage({
    groupId: "g1",
    senderId: senderName.toLowerCase(),
    senderName,
    text
  });

  await send("Ayush", "!game 6pm courts 1");
  for (const name of ["Ayush", "Priya", "Rohan", "Sara", "Dev"]) {
    await send(name, "confirm");
  }

  let responses = await send("Ayush", "!roster");
  assert.match(responses[0].text, /Waitlisted: Dev/);

  responses = await send("Sara", "drop");
  assert.match(responses[0].text, /Dev has been promoted/);

  responses = await send("Ayush", "!roster");
  assert.match(responses[0].text, /Confirmed: .*Dev/);
  assert.match(responses[0].text, /Waitlisted: -/);
});
