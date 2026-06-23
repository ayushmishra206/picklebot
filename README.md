# PicklePilot

PicklePilot is a WhatsApp-oriented pickleball coordination bot. This repo currently contains the runnable v1 core from the PRD: session creation, RSVP tracking, roster posting, match planning, cost entry, and settlement summaries.

## Run Locally

```bash
npm start
```

The local console adapter simulates a WhatsApp group. Type commands such as:

```text
Ayush: Game today 7 to 8?
Priya: In
Rohan: In +1
Sara: confirm
Ayush: !roster
Ayush: !plan
Ayush: 200/ person tha
Priya: Done
Ayush: !settle
```

State is written to `data/picklepilot.json` so sessions survive restarts during local testing.

## Test

```bash
npm test
```

## Current Scope

- Plain text command parsing plus common natural-language group chat patterns.
- One active session per group.
- Interested, confirmed, waitlisted, and out roster states.
- Natural game prompts such as `Game today?`, `Anyone today?`, and `Khelna hai aaj?`.
- Guest counting for messages like `In +1`.
- Conditional RSVPs such as `In agar rain nahi hui` stay tentative with the condition visible.
- Hinglish out phrases such as `nahi aa sakta` and `mushkil hai`.
- Per-person cost capture for messages like `227 each`, `180PP`, and `200/ person`.
- Payment acknowledgements from `Done`.
- Random/round-robin and rating-balanced planning modes.
- Fair sit-out rotation for odd / overflow player counts.
- Equal cost splits and weighted splits by rounds played.
- Netted settlement transfers that minimize payment hops.

## Next Integration Step

Wire `PicklePilotEngine` to a Baileys message adapter using a dedicated secondary WhatsApp number, as called out in the PRD. The domain logic is isolated in `src/core`, so the adapter should only translate WhatsApp messages into `{ groupId, senderId, senderName, text }` events and send returned responses.
