# 180 FamDinner Connection Game — Development Plan

Status: **Planning only — implementation must not begin until the ministry team explicitly approves this plan and says “we’re good to go for dev.”**

Target event: **Saturday, September 5, 2026**

## 1. Purpose

Create a mobile-first web game for 180, the young professionals fellowship ministry of Makati Gospel Church, that helps randomly assigned tablemates move past the initial awkwardness of dinner conversation.

Attendees will scan one event QR code, receive the current FamDinner's topic-aligned conversation prompts, talk to their tablemates, and optionally record short answers on their own device. Every table will use the same approved question set. Shared response collection, an officer dashboard, and aggregate visuals such as a word cloud are intentionally deferred until after the static pilot has been evaluated.

## 2. Product principles

- Conversation comes first; the phone should support interaction, not become the activity.
- Joining should take only a few seconds and require no attendee account in the first version.
- Prompts should feel warm, safe, and appropriate for a church young-professional gathering.
- Personal answers should not be publicly identifiable unless the attendee knowingly chooses that.
- The first version should be simple enough to test at one FamDinner and improve afterward.
- The interface must work well on common mobile browsers and imperfect venue Wi-Fi/mobile data.

## 3. MVP hosting decision

The pilot will be a **fully static website suitable for GitHub Pages**. It will not require attendee accounts, a database, or an officer dashboard.

Questions and event settings will be maintained in a human-readable **JSON file** committed with the website. Before each FamDinner, the ministry team will replace or revise the JSON content with a unique set of questions relevant to that event's topic, then republish the static site. This gives the ministry team a simple, reviewable content source without introducing a database or admin interface.

The event will use **one stable URL and one QR code** for all tables. The same QR code may be displayed at every table and in the event slides. There is no table selection or table-specific routing in the MVP.

Because GitHub Pages cannot collect responses by itself, answers entered during the pilot will remain only on the attendee’s device. They will not be visible to officers or other attendees. The pilot’s main goal is to test whether guided, event-relevant questions improve conversation.

Shared responses, moderation, officer access, and the word-cloud visualizer remain possible Phase 2 features if the pilot proves useful.

## 4. Proposed MVP experience

### Attendee flow

1. Scan the event QR code displayed at the table or on the event slides.
2. Land on a welcome screen showing the FamDinner title, date, event topic, a one-sentence explanation, and a brief privacy note.
3. Tap **Start connecting**; no account, name, or password is required for the pilot.
4. See the table’s connection card or one prompt at a time, with a progress indicator.
5. Ask a tablemate the displayed question and discuss their answer.
6. Optionally type a short personal note; any typed content stays on that device.
7. Mark the prompt complete and continue. The instructions should encourage hearing from different people at the table.
8. Finish with a celebratory screen and a reminder to return attention to the group.

### Proposed game format

For the pilot, use a **3 × 3 connection card (9 prompts)** rather than a traditional 5 × 5 bingo card. Nine prompts are more realistic during dinner and reduce phone use.

The event will support approximately **10 tables of 6–8 attendees**. Every table will receive the same event-specific question set from the JSON file. Questions should be deliberately written or selected for the current FamDinner rather than randomly assigned from a broad reusable bank.

The event question list will contain exactly two question types:

- **Icebreaker (`icebreaker`):** easy, welcoming questions intended to start conversation and help attendees learn about one another.
- **Message discussion (`message_discussion`):** optional questions tied directly to the speaker’s topic, Bible passage, or intended takeaway.

An event may contain only icebreakers. Message-discussion questions will be enabled only if the speaker chooses to provide or approve them. The interface must not show an empty discussion section when none are configured.

For the initial 3 × 3 card, the exact mix remains configurable per event. A working default is **6 icebreakers and 3 message-discussion questions** when the speaker opts in, or **9 icebreakers** when there is no discussion set. This ratio must be confirmed before development.

“Unique” in this plan means that the set is intentionally prepared for the current event and its topic; it does not mean that every table receives different questions. Reusing a strong icebreaker at a future event is allowed if the ministry team intentionally retains it, but older message-discussion questions must not carry over accidentally.

Example prompt types:

- Light: “What food could you happily eat every week?”
- Story: “What is something good that happened to you recently?”
- Faith: “Who is your favorite Bible character, and why?”
- Connection: “What hobby or skill would you like to learn?”

If message discussion is enabled, the speaker will provide the message title/topic, key Bible passage, intended takeaway, and approved discussion questions—or review questions drafted from that material. If the speaker opts out, no message details are required for the game and the event will use icebreakers only.

## 5. Screens in scope

- Welcome / event introduction
- Game card / prompt interaction
- Completion screen
- Friendly error/offline state

## 6. JSON content and event configuration

- **Event JSON:** event ID, title, date, topic, optional message details, card size, and the complete approved question list for that FamDinner
- **Question:** unique ID, type (`icebreaker` or `message_discussion`), question text, active status, and optional display order
- **Local progress:** event identifier, completed prompts, and optional private notes stored only in the browser

No attendee name, email address, phone number, password, or shared response data is required for the MVP.

Illustrative content shape (final field names may change during development):

```json
{
  "event": {
    "id": "fam-dinner-2026-09-05",
    "title": "180 FamDinner",
    "date": "2026-09-05",
    "questionCount": 9,
    "mix": {
      "icebreaker": 6,
      "message_discussion": 3
    }
  },
  "questions": [
    {
      "id": "ice-001",
      "type": "icebreaker",
      "text": "What food could you happily eat every week?",
      "active": true
    },
    {
      "id": "msg-001",
      "type": "message_discussion",
      "text": "What part of tonight's message stood out to you?",
      "active": true
    }
  ]
}
```

The initial implementation will favor one event JSON file as the single source of truth. Updating the event means reviewing the date, topic, message settings, and full question list together. Documentation and validation should make stale dates or old message questions easy to catch before publishing.

## 7. Privacy, safety, and moderation

- Explain clearly that optional typed notes stay on the attendee’s device and are not submitted to 180/MGC.
- Encourage conversation rather than typing detailed or sensitive answers.
- Ask attendees not to enter private, sensitive, pastoral-care, or identifying information into the site.
- Provide a **Clear my progress and notes** action on the device.
- Avoid prompts that pressure attendees to disclose sensitive spiritual, medical, financial, relationship, or workplace information.
- If shared collection is introduced later, create a separate privacy and moderation design before implementing it.

## 8. Visual and interaction direction

- Warm, welcoming, youthful, and conversation-centered rather than corporate or overly game-like.
- Mobile-first, large tap targets, high contrast, readable type, and minimal typing.
- A visual identity that can use MGC/180 colors and logo only after the team supplies or approves the brand assets.
- Subtle progress and celebration; avoid distracting animation during dinner.
- Accessible labels, keyboard support throughout the site, and reduced-motion support.

## 9. Technical plan (to confirm after product decisions)

1. Preserve the existing starter project unless the chosen GitHub Pages deployment path requires a different static build setup.
2. Build the attendee experience as a responsive web app.
3. Store unfinished progress on the attendee’s device so an accidental refresh does not erase it.
4. Create the event JSON structure and add the single approved question set for the September FamDinner.
5. Create one stable event link and one downloadable/printable QR code that can be reused across all tables.
6. Configure GitHub Pages and document how officers update future event dates, topics, tables, and prompts.

## 10. Validation plan

- Test on iPhone Safari and Android Chrome at common mobile widths.
- Test QR entry from a fresh browser with no saved state.
- Test refresh/reconnect behavior and duplicate taps/submissions.
- Test the shared event QR code from multiple devices and verify that each opens the current event's approved question set.
- Test optional notes with long text, emojis, and Filipino/English content.
- Verify that no response or note is sent over the network.
- Verify that local notes from one device/browser are not visible on another.
- Run automated build, lint, and core interaction tests.
- Conduct a small ministry-team dry run before September 5 and a table-sized pilot if possible.

## 11. Delivery phases

### Phase 0 — Decisions and content

- Approve the game mechanic, JSON content structure, question mix, privacy wording, prompts, and branding.

### Phase 1 — Pilot MVP

- Attendee QR flow
- One event-specific 3 × 3 prompt set shared by every table
- Progress recovery
- September 5 event configuration and one shared event QR code
- Static GitHub Pages deployment

### Phase 2 — Post-event review

- Review participation, completion, table dynamics, attendee feedback, and privacy concerns.
- Decide whether to add shared anonymous responses, moderation, an officer dashboard, a word cloud, reusable event creation, accounts, or a permanent database-backed system.

## 12. Success measures for the pilot

- QR-to-first-prompt time is under one minute for most attendees.
- A meaningful portion of attendees complete several prompts without officer assistance.
- Table leaders observe that the shared prompts make it easier for attendees to begin and sustain conversation.
- Attendee feedback indicates that the game made starting conversations easier.
- The event question set remains recognizably connected to the message topic.

## 13. Decisions required before development

1. **September discussion:** Does the September speaker want message-discussion questions? If yes, what are the message title/theme, key Bible passage, intended takeaway, and any topics to avoid?
2. **Question mix:** When discussion is enabled, approve or revise the proposed 6 icebreaker + 3 message-discussion mix. When it is disabled, should the card contain all 9 icebreakers or use a smaller card?
3. **Interaction style:** Should attendees type optional private notes, or should the site simply reveal/track prompts and keep the experience entirely conversational?
4. **Event access:** Confirm that one shared QR code and URL for all tables is the desired approach.
5. **Timing:** How many minutes will be allotted to the activity, and should all nine prompts be achievable or intentionally more than most groups will finish?
6. **Question approval:** Who will update and review the event JSON before each FamDinner, including speaker approval for message-discussion questions?
7. **Branding:** Please provide the approved 180/MGC logo, colors, fonts, and any wording that must appear.
8. **Deployment:** Confirm that GitHub Pages is the preferred hosting target for the static pilot.

## 14. Explicit development gate

No implementation, dependency changes, deployment, database setup, or external service configuration will begin until:

- the required decisions above are answered, including whether September will use message-discussion questions and the approved question mix;
- this plan is revised if needed; and
- the user explicitly says **“we’re good to go for dev.”**
