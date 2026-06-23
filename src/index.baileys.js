import { resolve } from "node:path";
import { BaileysAdapter } from "./adapters/baileysAdapter.js";
import { PicklePilotEngine } from "./core/engine.js";
import { JsonStore } from "./storage/jsonStore.js";

const dataFile = resolve(process.env.PICKLEPILOT_DATA_FILE ?? "./data/picklepilot.json");
const authDir = resolve(process.env.PICKLEPILOT_AUTH_DIR ?? "./auth");
const groupId = process.env.PICKLEPILOT_GROUP_ID ?? null;

const store = new JsonStore(dataFile);
const engine = new PicklePilotEngine(store);
const adapter = new BaileysAdapter({ engine, authDir, groupId });

await adapter.start();
