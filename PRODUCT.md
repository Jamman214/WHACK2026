# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
People who want to know more than they do now. Most of their news reaches them through recommendations on social feeds, and those feeds keep them inside a filter bubble. They want a guided way to move past what they already follow, without having to figure out on their own where to go next.

The current build is a demo for WHACK 2026, but design decisions are judged against this reader, not against the demo audience.

## Product Purpose
It shows people stories from outside their filter bubble and gives them a recommended way to explore past it. Onboarding works out what's already in the reader's feed. The news feed then mixes stories they already know with "bridge" stories one or more steps out, and the Topic Atlas shows how far every subject is from what they know. Readers can add topics to their bubble, and the feed re-ranks around the bigger bubble.

It works when a reader can see at a glance where their knowledge stops, how far new knowledge is, and what step to take next.

The idea started out covering social events as well as news. It narrowed to news to keep it feasible. Broader content is a possible later direction, not a current commitment.

## Positioning
Engagement feeds keep you inside what you already like. This product shows where your knowledge stops and how far away new topics are, and it gives an explained route ("Because you follow X → Y") so you can grow your bubble one step at a time.

## Operating Context
- Flow: Intro → onboarding Galton board (sort 18 headlines as "in my feed / not in my feed", which defines the bubble) → news feed (the main screen, one card per screen, snap scroll) → Topic Atlas (a full-screen solar-system map over the feed: "You" at the centre, 14 subject planets on rings by bridge distance, and topics as moons).
- Three navigation levels, always shown as a breadcrumb: Map › Planet › Topic.
- Core concepts to keep intact: *home* (what you know), *distance* (steps out to new knowledge), *building out your bubble* (step by step).

## Capabilities and Constraints
- Desktop web is the focus.
- 3D graphics (three.js: the Galton board and the solar-system Atlas) are wanted on purpose, to make the demo impressive. They aren't decoration to strip out.
- Data: a backend is being wired up, but mock data is used for now. Mock cards are labelled *Demo summary* and never link to invented articles. An optional Guardian API key pulls real headlines.
- Taxonomy: 60 topics in 14 categories with weighted links (`src/data/taxonomy.ts`). One link strength ("Related") is used everywhere.
- Undecided: whether a mobile/PWA version and social-event content come later.

## Evidence on Hand
- 18-headline onboarding deck (`src/data/headlines.ts`), taxonomy and edge reasons (`src/data/`), mock feed (`src/feed/mock.ts`).
- No real users, testimonials, metrics or press yet. Don't fabricate any.

## Product Principles
1. **Calm, not addictive.** No engagement-bait: no streaks, autoplay loops, notification hooks or infinite pull. It's the "anti-Instagram".
2. **Distance is always legible.** Any screen that shows a topic or story should make clear how far it is from what the reader knows.
3. **Every recommendation explains itself.** A bridge story always says why it was chosen ("Because you follow X → Y").
4. **Growth is step by step and chosen.** The reader picks what joins their bubble. The product suggests the next step and never forces it.
5. **Spectacle serves navigation.** The 3D scenes should impress, but hierarchy and knowing where to go next win over visual effect.
