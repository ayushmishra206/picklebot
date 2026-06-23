import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import { mkdir } from "node:fs/promises";

export class BaileysAdapter {
  constructor({ engine, authDir, groupId }) {
    this.engine = engine;
    this.authDir = authDir;
    // groupId is optional: if set, only handle messages from this group.
    // Format: "<number>-<number>@g.us"
    this.groupId = groupId ?? null;
  }

  async start() {
    await mkdir(this.authDir, { recursive: true });
    await this._connect();
  }

  async _connect() {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false, // we print it ourselves for clarity
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        console.log("\nScan this QR code with the linked WhatsApp account:\n");
        qrcode.generate(qr, { small: true });
      }

      if (connection === "open") {
        console.log("WhatsApp connected.");
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        if (loggedOut) {
          console.error("Logged out. Delete the auth directory and restart to re-link.");
        } else {
          console.log(`Connection closed (code ${code}), reconnecting…`);
          this._connect();
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;

      for (const raw of messages) {
        if (raw.key.fromMe) continue;

        const jid = raw.key.remoteJid ?? "";
        if (!jid.endsWith("@g.us")) continue; // group messages only
        if (this.groupId && jid !== this.groupId) continue;

        const text = extractText(raw);
        if (!text) continue;

        const senderId = raw.key.participant ?? raw.key.remoteJid;
        const senderName =
          raw.pushName ??
          senderId.replace(/[^0-9]/g, "").slice(0, 10);

        const message = {
          groupId: jid,
          senderId: senderId.replace("@s.whatsapp.net", ""),
          senderName,
          text,
        };

        let responses;
        try {
          responses = await this.engine.handleMessage(message);
        } catch (err) {
          console.error("Engine error:", err);
          continue;
        }

        for (const response of responses) {
          try {
            await sock.sendMessage(jid, { text: response.text });
          } catch (err) {
            console.error("Send error:", err);
          }
        }
      }
    });
  }
}

function extractText(raw) {
  return (
    raw.message?.conversation ??
    raw.message?.extendedTextMessage?.text ??
    null
  );
}
