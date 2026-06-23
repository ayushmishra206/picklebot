import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export class ConsoleAdapter {
  constructor({ engine, groupId }) {
    this.engine = engine;
    this.groupId = groupId;
  }

  async start() {
    const rl = readline.createInterface({ input, output });
    output.write("PicklePilot local console\n");
    output.write("Format messages as Name: command, e.g. Ayush: !game 6pm courts 2\n");

    while (true) {
      const line = await rl.question("> ");
      if (line.trim().toLowerCase() === "exit") {
        rl.close();
        return;
      }

      const message = parseConsoleLine(line, this.groupId);
      if (!message) {
        output.write("Use Name: message\n");
        continue;
      }

      const responses = await this.engine.handleMessage(message);
      for (const response of responses) {
        output.write(`PicklePilot: ${response.text}\n`);
      }
    }
  }
}

function parseConsoleLine(line, groupId) {
  const separatorIndex = line.indexOf(":");
  if (separatorIndex < 0) {
    return null;
  }

  const senderName = line.slice(0, separatorIndex).trim();
  const text = line.slice(separatorIndex + 1).trim();
  if (!senderName || !text) {
    return null;
  }

  return {
    groupId,
    senderId: senderName.toLowerCase().replace(/\s+/g, "-"),
    senderName,
    text
  };
}
