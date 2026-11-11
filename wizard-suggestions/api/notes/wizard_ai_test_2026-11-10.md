# Wizard suggestions with real AI answers (10 Nov 2026)

Local only, nothing pushed.
- api: branch Saizal-wizard-suggestions in worktrees/api-main-wizard, now at ac90066 (6a55ca6 = outfit fixes, ac90066 = world check; both below).
- Studio: branch Saizal-wizard-suggestions in worktrees/app-search-generate, at 12acc95 (unchanged).
- Database: the local copy (Prisma dev instance liforma-wizard-test), test user wizard-test@example.test.

AI: google/gemini-3-flash-preview through OpenRouter, the same single setup call as before.
Key: a personal OpenRouter key (OPENROUTER_API_KEY), put in the api .env for this test only and removed afterwards. REDACTED_KEY_FILE_PATH

Cost and speed: 13 calls, $0.215 in total ($0.016-0.017 each, as OpenRouter reported them, read from the usage ledger in the copy). Each call took 5.6-8.1 s.
- 12 calls went through the Studio's own route as the test user.
- 1 call went through the real New Experience brief form.

## Results

Before the fixes:

| Brief | Character the AI made | Sets suggested | Outfit pick, then more |
|---|---|---|---|
| Hotel check-in late at night | Elena, hotel receptionist, woman, mediterranean | 3 Boutique Hotel lobby views of the reception desk: fits | hotel_front_desk_staff; satin_suit, business_woman_in_suit.1, ceo_in_white_jacket: fits |
| GP appointment, headaches | Dr. Aris, GP, woman, mediterranean | Doctors Surgery consultation room, waiting room, Examination Centre room: fits | hospital_doctor; nurse, high_school_science_teacher, satin_suit: pick fits, extras so-so |
| Job interview at a start-up | Sarah, hiring manager, woman, european | 2 coworking private offices, skyscraper office: fits | business_woman_in_suit.1; business_woman_in_shirt.1, business_woman_in_top.1, blue_button_shirt_and_jeans: fits |
| Café order goes wrong | Elena, barista, woman, mediterranean | 2 London Coffee Shop counters, Spanish Cafe counter: fits | barista--mediterranean is NOT in the Studio's list, so she starts in the white T-shirt; french/spanish cafe waitress, white tee |
| Airport bag over the limit | Elena, check-in agent, woman, european | 2 airport check-in desk views, airport service counter: fits | AI copied the whole line "airport_check_in_agent: Airline Check In Uniform (...)": logged and dropped, so white T-shirt; hotel_front_desk_staff, business_woman_in_suit.1, train_ticket_collector |

After fix 1 + 2 (outfits):

| Brief | Sets suggested | Outfit pick, then more |
|---|---|---|
| Airport (again) | same 3 airport sets: fits | airport_check_in_agent: fits; hotel desk, business suit, train ticket collector |
| Café (again) | same 3 café sets: fits | barista: fits; french/spanish cafe waitress, blue shirt and jeans |
| Male police officer, speeding stop | park nature trail, tree-lined avenue, airport entrance: no roadside set exists | policeman_american; policeman_british, business jacket: fits |
| Car mechanic ("he") | Dwarven Depths workshop, Space Center hangar, Dwarven forge: wrong world, no garage set exists | grey tee and black trousers; zip jacket and jeans, white tee (no mechanic outfit exists) |

After fix 3 (stricter set rule):

| Brief | Sets suggested | Outfit pick, then more |
|---|---|---|
| Car mechanic (again) | none: right, there is no garage | grey tee and black trousers; shirt and jeans, business jacket |
| Police (again) | park nature trail, tree-lined avenue, Djinn Desert path (fantasy): still wrong | policeman_american; policeman_british, park attendant, taxi driver |
| GP (again) | 3 Doctors Surgery rooms: fits | hospital_doctor; cardigan, blue shirt |
| Airport through the real brief form | 3 airport sets, shown in the Set step: fits | airport_check_in_agent, shown first in Clothes with 3 more, all captioned "Suggested for Airport check-in agent" |

After the fixes, no outfit id or set number was dropped (api log). Screenshots in this folder:
- clothes_suggested_airport.jpg
- set_suggested_airport.jpg

## Bugs found and fixed (api 6a55ca6)
1. **Whole line copied as the outfit id.** The model got outfits as lines like "id: name (labels)" and once copied the whole line. Outfits are now an object keyed by id. 0 such errors in the 8 calls after the fix.
2. **The outfit list didn't match what the Studio can show.** The list came from each avatar's own outfit ids: 120 women's ids, 45 of them race-baked copies like barista--mediterranean, or old custom ids. The Studio dresses every race look from its avatar set list. The list now comes from the avatar set list (75 women's, 64 men's, an exact match with the Studio), else the avatar's own list.
3. **Sets from another world.** The set rule now asks only for sets from the brief's own world or period that show the same kind of place, and for none when nothing fits. This fixed the mechanic (now none), but not the police stop: a fantasy desert path came back as the third choice in 1 of 2 runs.

## World check (api ac90066, user said yes 10 Nov)
- No hand-made list was needed. Every public set already has a platform `universe` label: contemporary 123, historical 80, fantasy 121, science-fiction 5. The labels come from catalogue labels, else from the collection name (collectionUniverseEra.ts).
- How it works:
  - The AI returns `setUniverse`, one of the platform universes: contemporary, historical, fantasy, science-fiction, supernatural.
  - Each set line shows "(universe; collection)".
  - The server keeps only suggested sets in that universe, and logs any it drops.
  - Sets with no universe label are not offered at all (also logged).
  - `setUniverse` is not sent on to the Studio.
- Real check, 5 calls, $0.085:

| Brief | Sets |
|---|---|
| Police stop | 3 modern park paths |
| Car mechanic | none (no garage set exists) |
| Hotel check-in | 3 hotel lobby views |
| Dwarf blacksmith | 3 Dwarven Depths sets (fantasy) |
| London 1940 radio operator | Cabinet War Room, 10 Downing Street study, university archive room (all 1940s) |

- No set needed dropping: the AI kept to the brief's universe on its own.
- In the same 5 runs, the outfit check dropped and logged 2 extra outfit ids. Both were on briefs where no outfit fits: an invented `autumn_outfit_jacket_and_scarf` (blacksmith), and a men's `business_man_in_jacket_1` for a woman (radio operator). The starting outfits were valid. The women's list has no fantasy or 1940s clothes.
- All 18 calls today: $0.30.

## Not fixed (for a decision)
- **The AI picks a woman for every brief that doesn't say "male" or "he"** (9 of 9 runs). Age is always 35, because the 9 Nov prompt says so. The name was "Elena" 5 times, and 4 of 9 women were mediterranean. This is the 9 Nov prompt; I didn't change it.
- **Missing content.** There is no garage set, no modern roadside set and no mechanic outfit.
- **Hair ids.** The setup call still sends 832 + 635 hair ids, about 11k tokens per call.
