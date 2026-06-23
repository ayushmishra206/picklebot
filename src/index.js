import { resolve } from "node:path";
import { ConsoleAdapter } from "./adapters/consoleAdapter.js";
import { PicklePilotEngine } from "./core/engine.js";
import { JsonStore } from "./storage/jsonStore.js";

const dataFile = resolve(process.env.PICKLEPILOT_DATA_FILE ?? "./data/picklepilot.json");
const groupId = process.env.PICKLEPILOT_GROUP_ID ?? "local-group";

const store = new JsonStore(dataFile);
const engine = new PicklePilotEngine(store);
const adapter = new ConsoleAdapter({ engine, groupId });

await adapter.start();
