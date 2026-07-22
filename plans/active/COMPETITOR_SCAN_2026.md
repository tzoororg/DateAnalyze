# Competitor Scan — Couples/Date-Night Apps (2026)

Research for the "Us" Play Store launch (~Aug 1 2026). Web research only, no local code changes.

## 1. Landscape table

| App | Lane | Core loop | Pricing | Standout feature |
|---|---|---|---|---|
| **Paired** | Daily-question relationship coaching | Daily question (Mon–Sat) + Sunday quiz, answers revealed simultaneously; courses on love languages/conflict | Free tier; Premium ~$6.99–9.99/mo (per couple, annual cheaper) | Deep quiz library (love languages, attachment styles) + expert-authored courses |
| **Lasting** | Clinical/therapy-style coaching | 5-min guided daily session built on Gottman research | $11.99/mo or $77.99/yr | Gottman-method curriculum, positioned as counseling-adjacent |
| **Agapé** | Wellness/communication | Research-backed questions + connection games | Freemium | 20-years-of-research framing, emotional-intimacy focus |
| **Cupla** | Shared logistics | Shared calendar, to-do lists, wishlist/plans, chat | Freemium | Calendar built *only* for two people (not a generic shared calendar) |
| **Cobble** | Date-night planning | Home date-night ideas, virtual event scheduling | Freemium | Curated at-home date content |
| **Lovewick** | Daily connection | Daily prompts/games | Freemium | (niche, thin public data) |
| **Between** | Memory keeping / private messenger | Private photo/message scrapbook + chronological timeline, anniversary countdowns | Freemium, ~$4–5/mo premium | Best-in-class chronological memory timeline; "private space" positioning since 2012 |
| **The Couple / Couple Widget** | Widget-first connection | Shared home-screen widget (photos, notes, countdown) updates live on both phones | Freemium | Zero-effort ambient presence via widget, no need to open app |
| **Locket** | Widget-first micro-connection | Snap a photo → appears instantly as partner's lock-screen widget | Free (ads/premium upsell) | Real-time lock-screen photo widget — near-zero friction |
| **Kindu** | Bedroom/intimacy games | Swipeable card decks, matched interests | Freemium, paywalled decks | Fun/flirty card-deck mechanic |
| **LoveNudge** | Love-language tracking | Daily nudge to perform partner's love-language action, streak-style | Freemium | Explicit 5-love-languages action tracker |
| **Happy Couple** | Trivia/quiz | "How well do you know your partner" quiz battles | Freemium, ad-heavy | Competitive quiz format |
| **Flamme** | AI-driven daily connection | Daily activities/quizzes/games + AI coach (Duo AI, LDR Buddy, AI Date Planner) | Freemium | AI relationship coach + home-screen connection widgets (milestones/countdowns/memories) |
| **Evergreen** | Daily connection/education | Daily tips, "get to know your partner" content, expert relationship tips | Freemium | Editorial/expert-tip content angle |
| **Official (Match Group)** | General relationship management | Shared calendar, chores, date ideas, check-ins | Freemium | Backed by Match Group distribution/marketing muscle |
| **Amora** | All-in-one daily connection | Daily questions + shared journal + "stories" feed | Freemium | Positioned as 2026's "best overall" in several roundups |
| **DaterGraph / Habi / OurCouple / Pookie** | Newer entrants, tracker-adjacent | Mix of day-counter + journal + widget | Freemium | Fast-follow copies of the above patterns |

Notably: **none of these are structured around logging dates you actually went on with per-partner ratings, categories, and a recommendation engine.** Almost every competitor is a *daily-engagement* app (prompts/quizzes/coaching), not a *retrospective activity log*. Between and The Couple/Locket are the closest analogues (memory timeline, widget), but neither does structured logging + analytics + suggestions.

## 2. 2026 feature/design trends (table stakes vs. differentiators)

- **Home-screen widgets are table stakes** for the "ambient connection" lane (Locket, The Couple, Flamme all have them) — a widget-less app reads as dated in this category.
- **Streaks**, reframed as "trend markers" rather than pass/fail (Flamme explicitly softened streak framing after backlash) — gamification is expected but punitive streaks are now seen as a red flag.
- **AI relationship coach / AI date planner** is the newest push (Flamme's Duo AI, LDR Buddy) — 2026 roundups increasingly list "AI" as a comparison column.
- **Freemium-with-paywalled-content** is the default business model; pure "$X once" or ad-free-forever is rare and gets called out positively when found.
- **Privacy/trust is a live concern** — 2025 cross-app-tracking allegations and "logging complaints/arguments feels toxic" sentiment show users are wary of surveillance framing; local-first/no-account apps have a trust story to tell if they lead with it.
- **Aggressive monetization is a top complaint** (Happy Couple: "constantly requesting money," broken ad-reward promises) — reviewers reward apps that don't nag.
- **Love-language/attachment-style quizzes** are near-universal in the coaching lane (Paired, Agapé, LoveNudge) — expected content, not a differentiator anymore.
- **Chronological memory timeline** (Between) is the closest existing pattern to a "History" tab, validated as a top draw ("best for memory keeping").

## 3. Our strengths vs. the field

- **We're the only one doing structured post-date logging + analytics.** Category, cost tier, effort, mood tags, per-partner 1–5 ratings, "would repeat" — nobody else captures a real record of what you *did* and how it *went*; competitors ask about feelings/quizzes, not events.
- **Suggest tab (UCB1 bandit over real history + catalog) is a genuine differentiator.** Competitors offer static "date idea" lists (Cobble) or AI chat planners (Flamme); we personalize from actual logged outcomes, which is more credible than an LLM guessing.
- **Free, no ads, no subscription** is rare and increasingly desired — direct antidote to the #1 complaint category (aggressive monetization, paywalled content, broken ad-reward promises).
- **Local-first / works fully offline without an account** directly answers the 2025 privacy-tracking backlash — nobody else in the list leads with "your data never has to leave your phone."
- **Insights/"Wrapped" recap** is closer to Between's memory-timeline appeal but data-driven (charts) rather than just a photo scrapbook — a novel combination.
- **Photo gallery + notes** covers Between's core memory-keeping appeal without needing it as a separate app.

## 4. Weaknesses/gaps, ranked by first-impression/retention risk

1. **No home-screen widget.** This is the single most table-stakes feature in the category now (Locket, The Couple, Flamme all ship one) — a couples app without one will feel behind on first impression, and widgets are also the #1 organic re-engagement hook (visible every unlock vs. an app icon).
2. **No daily-engagement hook.** Every top competitor has a reason to open the app *daily* (question, nudge, streak). We're an after-the-fact logger — without a nudge, usage risk clustering around only actual dates, meaning weeks of silence and higher churn before the habit forms.
3. **No love-language / "get to know your partner" quiz content.** This is now near-universal in the space and costs little to add relative to how often reviewers cite it as a selling point.
4. **Cold-start Suggest tab has nothing to say for week-one users** (UCB1 needs history) — first impression could feel thin next to Flamme's always-available AI planner.
5. **No streak or trend visualization for "are we going on dates regularly."** Cheap gamification competitors lean on; our Insights tab could show this without becoming punitive.
6. **No push-based "we haven't logged in a while" or partner nudge beyond new-date notification** — retention lever competitors use heavily (daily nudges).
7. **No AI features at all**, while "AI date planner" is the newest marketing hook in the space (Flamme). Lower priority than the above since our bandit-on-real-data pitch is arguably a stronger, more honest claim — but it may cost us in comparison articles/roundups that reward "has AI."

## 5. Recommendations, ranked by impact ÷ effort

1. **[Launch] Ship a home-screen widget** (Android supports this natively; TWA-wrapped PWA can add a native widget via the Android shell) showing next planned/wishlist date or last date logged — closes the single biggest category gap, cheap relative to impact since we already have the data model.
2. **[Launch] Lead marketing copy/store listing with "free, no ads, no subscription, works offline"** — zero engineering cost, directly targets the field's most common complaint (monetization).
3. **[Launch] Seed the cold-start Suggest tab harder** — surface the 49-catalog ideas with clearer "no history yet" framing instead of thin bandit output, so week-one users don't bounce off an empty-feeling tab. Low effort (copy/UI only), fixes the sharpest first-impression gap.
4. **[Post-launch] Add a lightweight "dates this month" streak/frequency chart to Insights** — reuses existing analytics.js aggregation, gives a soft gamification hook without punitive pressure, cheap since charts.js already exists.
5. **[Post-launch] Add an opt-in gentle reminder notification** ("it's been a while since your last date") — small addition to existing push infra (already have FCM set up for partner-logged-date pings), meaningful retention lever.
6. **[Post-launch] Add a small love-language or "how well do you know your partner" quiz feature** — highest content-authoring effort of the list (needs question bank), but closes a near-universal category expectation; defer past launch since it's parallel to our core loop rather than blocking it.
7. **[Post-launch] Explore an AI-assisted "plan our next date" prompt** that composes from Suggest-tab output rather than a generic LLM chat — keeps our real-data differentiation while picking up the "has AI" comparison-article checkbox. Higher effort (needs an LLM API integration we don't currently have), lowest urgency since our bandit story is already defensible without it.

## Sources

- [Paired App Reviews 2026](https://instapv.co.uk/paired-app/)
- [Paired Relationship App Review 2026 (YouTube)](https://www.youtube.com/watch?v=jpui3nGPuhM)
- [Paired: Couples & Relationship - Google Play](https://play.google.com/store/apps/details?id=com.getpaired.app)
- [Paired App Review 2026 - Panoramic Posts](https://panoramicposts.com/paired-app-review/)
- [Paired App Reviews - OneDateIdea](https://www.onedateidea.com/reviews/paired-app-reviews/)
- [Best Apps for Couples in 2026 - Amora](https://tryamora.app/blog/best-apps-for-couples-2026)
- [9 Best Couples Apps in 2026 - Connected Couples](https://www.connectedcouples.app/blog/best-couples-apps-2026)
- [Is Paired Worth It in 2026 - LoveFix](https://lovefix.app/resources/apps/is-paired-app-worth-it-2026/)
- [OurCouple vs Paired 2026](https://ourcouple.app/blog/ourcouple-vs-paired)
- [20 Best Apps for Couples 2026 - The Nine Hertz](https://theninehertz.com/blog/best-apps-for-couples)
- [14 Best Relationship Apps 2026 - Excellent Webworld](https://www.excellentwebworld.com/best-relationship-apps/)
- [Ultimate Guide to Relationship Management Apps 2026 - Cupla](https://cupla.app/blog/the-ultimate-guide-to-relationship-management-apps-in-2026/)
- [Best Relationship Apps That Actually Work 2026 - LoveFix](https://lovefix.app/resources/apps/best-relationship-apps-that-actually-work-in-2026/)
- [Best Couples Apps 2026 - OurCouple](https://ourcouple.app/blog/best-couples-apps-2026)
- [7 Best Couple Apps 2026 - Habi](https://habi.app/insights/best-couple-apps/)
- [Couple Widget for Android - Uptodown](https://couple-widget.en.uptodown.com/android)
- [12 Must-Have Apps for Long Distance Couples 2026 - Fhynix](https://fhynix.com/apps-for-long-distance-couples/)
- [Why Cupla Is the Best App for LDR 2026 - Cupla](https://cupla.app/blog/long-distance-relationship-app-cupla/)
- [11 Must-Have Apps for Long Distance Couples - Cupla](https://cupla.app/blog/11-must-have-apps-for-long-distance-couples/)
- [7 Best Couples Apps 2026 - Pookie](https://pookie-app.com/blog/best-couples-apps-2026/)
- [Best Apps for Long-Distance Couples 2026 - Heynori](https://heynori.com/blog/two-career-family-coordination/best-apps-for-long-distance-couples)
- [Happy Couple Reviews 2026 - JustUseApp](https://justuseapp.com/en/app/1049075190/happy-couple/reviews)
- [Love Nudge Reviews 2026 - JustUseApp](https://justuseapp.com/en/app/495326842/love-nudge/reviews)
- [Kindu For Couples Reviews - JustUseApp](https://justuseapp.com/en/app/346524753/kindu-for-couples/reviews)
- [Kindu App Review - MobileAppDaily](https://www.mobileappdaily.com/product-review/kindu-app-for-couples)
- [Kindu Review - Couponpac](https://us.couponpac.com/top-10/relationship-apps-for-couples/kindu/)
- [Kindu App Review - Ikana Business Review](https://ikanabusinessreview.com/2025/10/kindu-app-review-ideas-and-games-to-boost-connection/)
- [Evergreen: Relationship Growth - App Store](https://apps.apple.com/bm/app/evergreen-relationship-growth/id1573360122)
- [Evergreen: Relationship Growth - Google Play](https://play.google.com/store/apps/details?id=com.evergreenapp.evergreen&hl=en_US)
- [Flamme: Cozy Couples App - App Store](https://apps.apple.com/us/app/flamme-cozy-couples-app/id1583601044)
- [Flamme Review - OneDateIdea](https://www.onedateidea.com/reviews/flamme/)
- [Flamme: Cozy Couples App - Google Play](https://play.google.com/store/apps/details?id=app.createaspark.mobile&hl=en_US)
- [Flamme - MWM](https://mwm.ai/apps/flamme-cozy-couples-app/1583601044)
- [Mindful Suite - Best Relationship Tracker Apps 2026](https://www.mindfulsuite.com/reviews/best-relationship-tracker-apps)
- [Dating tracking app: useful tool or privacy risk - VeePN](https://veepn.com/blog/dating-tracking-app/)
- [Best Relationship Tracker Apps 2026 - DaterGraph](https://datergraph.me/blog/modern-dating-culture/best-relationship-tracker-apps-2026/)
