# PicklePilot

PicklePilot is a WhatsApp-oriented pickleball coordination bot. This repo currently contains the runnable v1 core from the PRD: session creation, RSVP tracking, roster posting, match planning, cost entry, and settlement summaries.

## Run Locally

```bash
npm start
```

The local console adapter simulates a WhatsApp group. Type commands such as:

```text
Ayush: !game 6pm courts 2
Priya: in
Rohan: +1
Sara: confirm
Ayush: !roster
Ayush: !plan
Ayush: !costs court 800 shuttles 400 paid Ayush
Ayush: !settle
```

State is written to `data/picklepilot.json` so sessions survive restarts during local testing.

## Test

```bash
npm test
```

## Current Scope

- Plain text command parsing.
- One active session per group.
- Interested, confirmed, waitlisted, and out roster states.
- Random/round-robin and rating-balanced planning modes.
- Fair sit-out rotation for odd / overflow player counts.
- Equal cost splits and weighted splits by rounds played.
- Netted settlement transfers that minimize payment hops.

## Next Integration Step

Wire `PicklePilotEngine` to a Baileys message adapter using a dedicated secondary WhatsApp number, as called out in the PRD. The domain logic is isolated in `src/core`, so the adapter should only translate WhatsApp messages into `{ groupId, senderId, senderName, text }` events and send returned responses.
