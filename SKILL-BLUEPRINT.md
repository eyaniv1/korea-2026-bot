# Trip Companion App — Skill Blueprint

This document captures the complete architecture, data model, workflow, and infrastructure needed to recreate a trip companion application for any destination. It serves as the foundation for a reusable Claude Code skill.

---

## 1. What Gets Built

The skill produces three deliverables:

### A. Trip Companion Web App (HTML)
A single `index.html` file hosted on GitHub Pages, serving as a mobile-first trip planner with:
- **Cover page** — destination flag, family/group name, dates, route overview, local proverb
- **Day pages** — one per day, swipeable, with three tabs each:
  - **Itinerary tab** — interactive map (Leaflet/OpenStreetMap) with numbered POI markers + POI list with info modals, Google Maps links, activity badges, voucher links, and rainy day alternatives
  - **Hotel tab** — hotel name, confirmation voucher link, dates
  - **Transport tab** — flights, trains, car rental, taxi details, voucher links
- **ToDo page** — persistent checkboxes (localStorage) for all reservations, bookings, pre-trip tasks with dates and booking links
- **Info page** — practical guides (payments, transit cards, tipping, ATMs, etc.)
- **Missing page** — places/experiences not in the itinerary but worth considering, tiered by priority
- **Floating chat bubble** — AI assistant powered by Claude API via Express backend
- **Bottom navigation bar** — date-labeled buttons for each day + special pages

### B. Telegram Bot
A Node.js bot running on Railway with:
- **Chat** — responds when mentioned, replied to, or via commands
- **Voice messages** — transcribed via Groq Whisper, then answered by Claude
- **Photo analysis** — send photos of signs/menus for translation/identification
- **Location-aware answers** — share location, ask "what's good nearby?"
- **Web search** — Claude searches the web when current info is needed
- **WanderGuide proximity alerts** — monitors live GPS, sends push notifications near POIs
- **Scheduled messages** — morning briefing, evening reminder, photo prompt
- **Admin commands** — response mode, schedule toggle, add/remove tips and POIs
- **Express HTTP API** — serves the web app chat endpoint

### C. POI Database
A JavaScript module with 80-200+ points of interest including:
- Name, GPS coordinates, description, city, category
- Categories: temple, palace, market, food, nature, culture, shopping, nightlife, viewpoint, hidden-gem
- Static POIs (pre-loaded) + dynamic POIs (added via Telegram /addpoi command)
- Distance calculation and proximity search functions

---

## 2. Data Model

### POI Object
```javascript
{
  n: 1,                    // display number on map
  key: "gyeongbokgung",   // unique key for description lookup
  time: "9:15 AM",        // suggested time (or "Morning", "PM", "Optional", "OR")
  name: "Gyeongbokgung Palace",  // display name
  lat: 37.5796,           // GPS latitude
  lng: 126.9770,          // GPS longitude
  q: "Gyeongbokgung+Palace+Seoul",  // search query for DuckDuckGo/Google Maps
  badge: "hike",          // optional: "hike", "bike", "food", or null
  bt: "3.5 km · 1.5-2 hrs · +236m", // optional: badge text for hike/bike stats
  voucher: "vouchers/Attractions/file.pdf"  // optional: path to voucher PDF
}
```

### Day Object
```javascript
{
  num: 1,                  // day number
  sd: "23/4",             // short date for nav buttons (day/month)
  title: "Arrive Seoul",  // day title
  date: "Apr 23 (Thu)",   // full date with day of week
  region: "Seoul",        // region label
  nc: "seoul",            // nav button CSS class (for color coding)
  rain: "Alternative activities description...",  // rainy day note
  transport: {
    text: "✈ Flight details...",        // transport summary line
    detail: "Full details with voucher links..."  // HTML with links
  },
  hotel: {
    text: "Hotel Name · Area<br><a href='voucher.pdf'>📎 Confirmation</a>"
  },
  pois: [ /* array of POI objects */ ]
}
```

### Description Object
```javascript
// Key-value pairs where key matches POI key
{
  "gyeongbokgung": "Description text...<br><br>🧭 <b>LOGISTICS:</b> How to get there, parking, etc.<br><br>🎫 <b>Booking:</b> Reservation requirements."
}
```

### ToDo Item Object
```javascript
{
  id: "f1",              // unique ID (used for localStorage persistence)
  text: "Flight...",     // description
  when: "✅ Booked",    // status or deadline
  link: "https://...",   // optional: booking URL
  linkText: "Klook"      // optional: link label
}
```

### ToDo Categories
- ✈ Flights
- 🏨 Hotels
- 🚗 Car Rental
- 🚄 Train
- 🎫 Must-Book Activities
- 📞 Recommended Reservations
- 📱 Before Departure

### Missing Item Object
```javascript
{
  tier: "TIER 1: Don't Skip These",  // tier title
  cls: "t1",                          // CSS class for color (t1=red, t2=orange, t3=blue, t4=green)
  items: [
    { t: "<a href='...'>Place Name</a> — brief", d: "Description..." }
  ]
}
```

---

## 3. Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Web App | Single HTML file | Trip companion interface |
| Maps | Leaflet.js + OpenStreetMap/CARTO tiles | Interactive maps with POI markers |
| Hosting (web) | GitHub Pages | Free, auto-deploys on git push |
| Bot runtime | Node.js | Telegram bot + Express API server |
| Bot framework | Telegraf v4 | Telegram bot interactions |
| AI | Anthropic Claude API (Sonnet) | Chat, web search, context-aware answers |
| Voice | Groq Whisper API | Voice message transcription |
| Scheduling | node-cron | Daily scheduled messages |
| HTTP API | Express.js + CORS | Web app chat endpoint |
| Hosting (bot) | Railway.app | Bot + API server hosting |
| Source control | GitHub (public repo) | Code + voucher storage |
| Persistence | localStorage (browser) | ToDo checkboxes |

### Required API Keys / Accounts
1. **Telegram Bot Token** — from @BotFather
2. **Anthropic API Key** — for Claude
3. **Groq API Key** — for voice transcription (free)
4. **GitHub account** — for repo + Pages hosting
5. **Railway account** — for bot hosting (free tier or ~$5/mo)

---

## 4. File Structure

```
project-root/
├── index.html              # Complete web app (single file)
├── bot.js                  # Telegram bot + Express API server
├── trip-context.js         # System prompt with full itinerary
├── poi-database.js         # POI database + proximity functions
├── package.json            # Node.js dependencies
├── .env                    # API keys (not in git)
├── .env.example            # Template for API keys
├── .gitignore              # Excludes node_modules, .env
├── vouchers/
│   ├── hotels/             # Hotel confirmation PDFs
│   ├── flights/            # Flight tickets/confirmations
│   ├── car-rental/         # Car rental confirmations
│   ├── train/              # Train tickets
│   ├── Taxis/              # Taxi/driver confirmations
│   └── Attractions/        # Activity vouchers (DMZ, e-bikes, etc.)
└── SKILL-BLUEPRINT.md      # This document
```

---

## 5. Infrastructure Setup Sequence

1. **Create GitHub repo** (public, for GitHub Pages)
2. **Create Telegram bot** via @BotFather → get token
3. **Get Anthropic API key** from console.anthropic.com
4. **Get Groq API key** from console.groq.com (free)
5. **Create Railway project** → connect to GitHub repo → add environment variables (TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, GROQ_API_KEY)
6. **Enable GitHub Pages** on the repo (source: master, root)
7. **Generate Railway public domain** (Settings → Networking → Generate Domain) for chat API
8. **Configure Telegram bot** — disable Group Privacy via @BotFather
9. **Create Telegram group** — add all travelers + bot

---

## 6. HTML App Architecture

### Page System
- Pages use show/hide (`display:none` / `display:block`), NOT CSS translateX (breaks Leaflet maps)
- `goPage(idx)` function switches pages, invalidates map sizes, scrolls nav button into view
- Swipe detection on touch events (ignores touches on maps)
- Keyboard arrow navigation

### Map Rendering
- Leaflet.js with CARTO Voyager tiles
- Maps initialized on page build, bounds stored per day
- `invalidateSize()` + `fitBounds()` called on every page/tab switch
- Numbered markers using custom `L.divIcon` with CSS circles

### Tabs Per Day
- Three tabs: Itinerary, Hotel, Transport
- Tab switching via `switchTab(dayNum, tabName)` function
- Map re-invalidation when switching back to Itinerary tab

### External Links
- All external links use `target="_blank" rel="noopener"`
- MutationObserver ensures dynamically created links get target="_blank"
- Search links use DuckDuckGo (avoids iOS Safari Universal Links interception)
- Google Maps links for POI locations (opens Maps app on mobile — desired behavior)

### Chat Panel
- Floating 💬 button, bottom-right, above nav bar
- Opens a slide-up panel with message history
- Per-user sessions via random session ID stored in localStorage
- Sends POST to Railway Express endpoint `/api/chat` with `X-Session-Id` header
- Simple markdown rendering (bold, italic, line breaks)
- Typing indicator while waiting for response
- Chat messages persisted in localStorage (last 100) — survive app close/reopen
- Local command interception for WanderGuide controls (no server round-trip needed)
- User's GPS coordinates auto-appended to messages mentioning "here", "nearby", "my location"

### Web Chat Commands (processed locally)
| Command | What |
|---------|------|
| `alerts on/off` | Enable/disable proximity alerts |
| `radius <meters>` | Set alert distance (50-5000m, default 300) |
| `cooldown <minutes>` | Time between alerts (1-120, default 20) |
| `realert <hours>` | Re-alert same POI (0.5-24, default 4) |
| `poll <seconds>` | GPS check interval (5-120, default 20) |
| `wanderguide status` | Show all settings, GPS, POI count |
| `clear alerts` | Reset alert history |
| `clear chat` | Wipe visible chat history |
| `help` | List all commands |
| Natural language POI add/remove | Via Claude (server-side processing) |
| Everything else | Sent to Claude API for AI response |

### Browser GPS + Client-Side Proximity
- `navigator.geolocation.watchPosition()` for continuous GPS tracking
- POI database fetched from server on load, refreshed every 5 minutes
- Proximity checks run locally every N seconds (configurable via `poll` command)
- Haversine formula for distance calculation
- Alert triggers: green toast notification at top of screen + chime sound + message in chat
- AudioContext generates short sine wave chime (works with AirPods/speakers)
- First user interaction required to unlock AudioContext (iOS requirement)

### iOS Safari Considerations
- No `apple-mobile-web-app-capable` meta tag (breaks new-tab link behavior)
- Spacer divs at bottom of pages (iOS ignores padding-bottom on scroll containers)
- `user-scalable=no` on viewport to prevent accidental zoom
- Touch swipe handler ignores touches starting on map elements

---

## 7. Bot Architecture

### Message Handling Priority
1. `bot.command()` handlers (registered FIRST)
2. `bot.on('text')` handler (registered LAST — catches mentions/replies)
3. `bot.on('photo')` — photo analysis
4. `bot.on('voice')` — voice transcription
5. `bot.on('location')` — one-time location shares
6. `bot.on('edited_message')` — live location updates

**Critical:** `bot.on('text')` MUST be registered AFTER all `bot.command()` handlers, otherwise commands get swallowed by the text handler in group chats.

### Command List
| Command | Access | Description |
|---------|--------|-------------|
| /plan | Everyone | Today's itinerary |
| /translate <text> | Everyone | Translate to local language |
| /nearby | Everyone | Show POIs within 1km |
| /tips | Everyone | Show curated tips |
| /status | Everyone | Bot settings |
| /help | Everyone | All commands |
| /alerts on\|off | Admin | Toggle WanderGuide |
| /radius <meters> | Admin | Alert distance (default 300) |
| /cooldown <minutes> | Admin | Time between alerts (default 20) |
| /realert <hours> | Admin | Re-alert same POI (default 4) |
| /addpoi <lat> <lng> <desc> | Admin | Add custom POI |
| /clearpois | Admin | Remove all custom POIs |
| /quiet | Admin | Only respond to commands |
| /normal | Admin | Respond when mentioned (default) |
| /chatty | Admin | Respond to everything |
| /schedule on\|off | Admin | Toggle scheduled messages |
| /addtip <text> | Admin | Add curated tip |
| /deltip <num> | Admin | Remove a tip |

### WanderGuide Proximity System
- Monitors live location updates from Telegram
- Compares GPS against POI database using Haversine formula
- Configurable radius, cooldown between alerts, re-alert cooldown per POI
- Sends alert with POI name, distance, description, and Google Maps link
- Works via both one-time location shares and live location (edited_message handler)

### Scheduled Messages (node-cron)
- 8:00 AM local time — morning briefing (today's plan)
- 8:00 PM local time — evening reminder (tomorrow's plan)
- 10:00 PM local time — photo prompt

### Express API (Full Endpoint List)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | AI chat (per-user sessions, supports text + image) |
| `/api/pois` | GET | Full POI database (static + custom) |
| `/api/pois` | POST | Add custom POI |
| `/api/pois` | DELETE | Clear all custom POIs |
| `/api/alerts` | GET | Proximity alerts since timestamp |
| `/api/broadcasts` | GET | Scheduled messages since timestamp |
| `/api/push` | POST | Send Pushover to @user or broadcast to all |
| `/api/pushover/register` | POST | Register Pushover key (with test notification) |
| `/api/pushover/users` | GET | List registered user names |
| `/api/wanderguide/register` | POST | Register WanderGuide user (for native apps) |
| `/api/wanderguide/location` | POST | Send GPS coordinates (for native apps) |
| `/api/wanderguide/toggle` | POST | Enable/disable alerts for a user |
| `/api/wanderguide/settings` | POST | Update global radius/cooldown/revisit |
| `/api/wanderguide/status` | GET | Get user or global WanderGuide status |
| `/api/health` | GET | Health check |

Full API documentation: see `API-Reference.md` / `API-Reference.pdf`

### Unified User System
- Single `users` table in PostgreSQL: name, pushover_key, telegram_user_id, web_session_id, enabled, lat, lng
- In-memory cache loaded from DB on startup
- Any registration path creates/updates the same unified user record
- Auto-registration on first interaction — order doesn't matter
- `getUserByTelegramId()` uses String comparison for BIGINT compatibility

### Pushover Integration
- Short clean messages for Siri readout through AirPods
- Full details sent to Telegram DM and web chat alert queue
- `@user message` and `broadcast message` commands in web chat

### Proximity Alert Architecture (Final)
Telegram live location → Server receives GPS → Update user in DB → Check POI database (Haversine) → Cooldown check (DB) → Proximity lock → Pushover + Telegram DM + Alert queue

### Broadcast System
- Scheduled messages stored in broadcast queue, polled by web app every 60 seconds
- Works even if no Telegram group is active

---

## 8. Skill Workflow (User Interaction Sequence)

When the skill is invoked for a new trip, follow this sequence:

### Phase 1: Trip Setup
1. Ask: destination country, cities to visit
2. Ask: travel dates (arrival/departure)
3. Ask: travelers (names, ages, relationships)
4. Ask: travel preferences (nature, culture, food, adventure, pace)
5. Ask: dietary restrictions
6. Ask: budget sensitivity (budget/mid/luxury)
7. Ask: driving preference (rental car? public transport?)
8. Ask: any specific must-do activities

### Phase 2: Research & Planning
9. Research destination: POIs, restaurants, hikes, cultural experiences
10. Research logistics: internal transport, typical costs, seasonal events
11. Propose initial itinerary (day-by-day)
12. Iterate with user on changes
13. Research quirky/unique local experiences
14. Identify what's missing / worth considering

### Phase 3: Build Web App
15. Create index.html with full page system, maps, POIs, descriptions
16. Add booking info and logistics to all POI descriptions
17. Add rainy day alternatives for each day
18. Add ToDo list with all reservations needed (with dates and booking links)
19. Add Info page (payments, transit, local tips)
20. Add Missing page (tiered recommendations)
21. Create GitHub repo, enable Pages
22. Verify all links work, mobile-friendly

### Phase 4: Build Bot
23. User creates Telegram bot via @BotFather
24. User provides API keys (Telegram, Anthropic, Groq)
25. Build bot.js with all commands, handlers, WanderGuide
26. Build poi-database.js with 80-200+ local POIs
27. Build trip-context.js with complete itinerary
28. Deploy to Railway, configure environment variables
29. Generate Railway public domain for chat API
30. Add chat bubble to web app connected to API

### Phase 5: Pre-Trip
31. User books hotels, flights, transport — update app with confirmations
32. Link voucher PDFs to relevant days
33. Mark completed items in ToDo
34. Verify distances/logistics make sense
35. Add Hebrew (or other language) toggle if needed
36. Bake final itinerary into bot context

### Phase 6: During Trip
37. Bot provides real-time assistance via Telegram
38. WanderGuide alerts near interesting places
39. Web app serves as portable itinerary with vouchers
40. Chat assistant answers questions from web app
41. Voice messages for hands-free interaction
42. Photo translation for signs/menus

---

## 9. Key Design Decisions & Lessons Learned

### What Worked Well
- **Single HTML file** — simple to deploy, no build step, works offline once cached
- **GitHub Pages + Railway** — free/cheap hosting, auto-deploy on push
- **DuckDuckGo links** — avoids iOS Safari Universal Links interception (Google links open Google app)
- **Show/hide pages** — more reliable than CSS translateX for Leaflet maps
- **localStorage for persistence** — ToDo checkboxes, chat history, WanderGuide settings, page state, chat open/closed state, active tab per day
- **Unified user system in PostgreSQL** — single `users` table replaces three separate systems (pushover, wanderguide, web sessions)
- **Pushover for native notifications** — reliable push to iOS with Siri readout through AirPods, works when phone is locked
- **Telegram for background GPS** — only app that can share live location in background on iOS
- **Server-side proximity detection** — Telegram provides GPS, server checks against POI DB, sends Pushover + alert queue. Works with phone locked.
- **PostgreSQL persistence** — custom POIs, user registrations, alert history, and global settings all survive server restarts
- **Per-user sessions** — cookie/localStorage session ID gives each person their own chat context
- **Voucher PDFs in git repo** — accessible from anywhere via GitHub Pages
- **Floating chat bubble** — non-intrusive, always accessible, hides nav bar when open
- **Date-based navigation** (23/4 instead of Day 1) — more practical during the trip
- **Local command interception** — WanderGuide commands processed instantly without server round-trip
- **Photo analysis in web chat** — Claude reads Korean signs, menus, translates from photos
- **@user direct push + broadcast** — send Pushover messages to individuals or everyone from web chat
- **Auto-registration** — any order of registration steps works (location, alerts, pushover). System auto-creates user on first interaction.
- **API for native app development** — full REST API documented for third-party clients to replace Telegram+Pushover

### What Didn't Work
- **CSS translateX page system** — breaks Leaflet map rendering on non-visible pages
- **apple-mobile-web-app-capable** — makes all links open in same tab on iOS
- **Google search links** — iOS Safari opens Google app instead of browser tab
- **Google Maps place links with coordinates** — shows coordinates instead of place names. Use `@lat,lng,17z` format instead.
- **Siri Announce Notifications for Telegram** — not supported despite documentation claiming otherwise. Telegram never fully implemented SiriKit messaging integration.
- **SMS alerts via TextBelt** — failed delivery to Israeli numbers
- **Twilio free tier** — requires 10DLC registration for US numbers, complex setup
- **Client-side proximity checking** — unreliable on iOS (browser stops when screen locked). Server-side via Telegram is the solution.
- **Telegram Markdown in bot messages** — special characters (|, —, <, >) crash the bot. Use plain text for all Telegram replies.
- **Railway environment variables with dotenv** — dotenv can override Railway's env vars if .env file exists. Must check `fs.existsSync('.env')` before loading dotenv.
- **PostgreSQL BIGINT type comparison** — Telegram user IDs come as numbers, PostgreSQL returns BIGINT as strings. Use `String()` comparison.
- **Concurrent proximity checks** — two location updates in same second can trigger duplicate alerts. Need in-memory lock (Set) per user.

### iOS Safari Gotchas
- Needs explicit spacer divs (not just padding-bottom) for content behind fixed nav
- `window.open()` may be blocked as popup — use `target="_blank"` on `<a>` tags instead
- Maps need `scrollWheelZoom: false` and touch event isolation to prevent page swipe interference
- Background JavaScript stops when screen is locked — no background processing possible
- AudioContext requires user interaction before first play (tap once to enable)
- `capture="environment"` on file input forces camera-only — remove for camera+gallery choice

### Bot Gotchas
- `bot.on('text')` must be registered AFTER all `bot.command()` handlers
- Consecutive same-role messages break Claude API — need message merging
- Live location updates come as `edited_message`, not `message`
- Telegram group privacy must be disabled AND bot removed/re-added for it to take effect
- All Telegram message replies should use plain text (no Markdown) to avoid parse crashes
- Every command handler needs try/catch + null user checks — any unhandled error crashes the entire bot process
- Railway redeploys create fresh Node.js process — all in-memory state lost. PostgreSQL provides persistence.
- Railway environment variables: use reference variables `${{Service.VARIABLE}}` or paste values directly. Never rely on dotenv on Railway.

---

## 10. Persistence Model

### Client-side (localStorage — per device, survives app close/reopen/restart)
| Key | Content | Max Size |
|-----|---------|----------|
| `chat_session` | Random session ID for per-user chat | ~20 bytes |
| `chat_messages` | Visible chat message history (role + HTML) | Last 100 messages |
| `todo_<id>` | Individual ToDo checkbox state ("1" = checked) | ~10 bytes each |
| `lastPage` | Last viewed page index | ~5 bytes |
| `lastTab_<dayNum>` | Last active tab per day (itinerary/hotel/transport) | ~15 bytes each |
| `chatOpen` | Whether chat panel was open | 1 byte |

### Server-side PostgreSQL (survives everything)
| Table | Content | Scope |
|-------|---------|-------|
| `users` | name, pushover_key, telegram_user_id, web_session_id, enabled, lat, lng | Per user |
| `custom_pois` | name, lat, lng, description, city, category, created_by | Global |
| `alert_history` | user_name, poi_name, alerted_at | Per user per POI |
| `settings` | key-value pairs (alertRadius, alertCooldown, alertRevisit) | Global |

### Server-side memory (lost on redeploy)
| Data | Scope | Lifetime |
|------|-------|----------|
| Web chat history per session | Per session ID | Until redeploy |
| Telegram chat history per chat | Per Telegram chat ID | Until redeploy |
| Broadcast messages queue | Global | Last 20 messages |
| Alert queue (for web app polling) | Global | Last 50 alerts |
| In-memory user cache | Global | Reloaded from DB on startup |

### What survives Railway redeploy
- ✅ All localStorage data (client-side)
- ✅ Static POI database (in code)
- ✅ Trip context / itinerary (in code)
- ✅ Custom POIs (PostgreSQL)
- ✅ User registrations + Pushover keys (PostgreSQL)
- ✅ Alert history (PostgreSQL)
- ✅ Global settings — radius, cooldown, revisit (PostgreSQL)
- ❌ Chat conversation context (server memory)
- ❌ Broadcast messages (server memory)
- ❌ Alert queue for web app (server memory)

---

## 11. Dependencies

### npm packages
```json
{
  "@anthropic-ai/sdk": "latest",
  "cors": "latest",
  "dotenv": "latest",
  "express": "latest",
  "groq-sdk": "latest",
  "node-cron": "latest",
  "pg": "latest",
  "telegraf": "latest"
}
```

### CDN (in HTML)
- Leaflet.js 1.9.4 (CSS + JS)
- CARTO Voyager map tiles

---

## 12. Customization Points

When creating a new trip, these are the main things that change:
1. **Trip context** — dates, travelers, dietary restrictions, preferences
2. **Day data array** — POIs, times, hotels, transport per day
3. **POI database** — destination-specific places (80-200+)
4. **Description database** — info + logistics + booking for each POI
5. **ToDo items** — reservations specific to this trip
6. **Missing items** — alternative activities for this destination
7. **Info page content** — payment methods, transit cards, local tips
8. **Cover page** — flag, proverb, family name
9. **Scheduled message times** — adjust to destination timezone
10. **Map default center** — country center coordinates for initial view
