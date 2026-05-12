<div align="center">
  <img src="./build/icon.png" style="width:80px">
  <h1>Customized ChatGuessr</h1>
</div>

## Info

This is a customized ChatGuessr version, extending the main app (v3.0.3) with additional game modes, scoring modifiers, visual mods, and advanced settings. It is created with the support and input from the amazing ChatGuessr community on Twitch. <3

Be aware that it is in constant development. Releases should be stable, but if you want the official version, get it from <a href="https://chatguessr.com">the ChatGuessr.com website</a>.

## Support

Want to support the project? Go to <a href="https://chatguessr.com">the official ChatGuessr.com website</a>. You can find a dono link at the bottom.

---

## Game Modes

### Game of Chicken 🐔
The winner of the previous round scores 0 points in the next round — unless they 5k. Last round is always free.

Options:
- **5k avoids chicken** — scoring 5000 points saves you from the chicken penalty
- **Chicken can 5k** — a 5k during your chicken round still gives you full points

### Wrong Country Only
Guessing in the correct country gives you 0 points. Only wrong-country plonks score. Borders are not always mapped perfectly, so guessing right on the border can be dangerous.

### Inverted Scoring (Antipode)
Scoring is reversed — the further your plonk is from the actual location, the more points you get. Closest to the antipode wins. Best played with difficult maps like Pain and Suffering or Random Pan and Zoom World.

### Exclusive Mode
Only the player with the closest guess scores points each round. Everyone else gets 0.

### Countdown / Countup
Guesses must follow a sequence based on the country name length:

- **Countdown** — each round you must plonk in a country with *fewer* letters than your previous round. Start with a long country name. Example: United Kingdom (13) → Afghanistan (11) → Thailand (8) → Myanmar (7) → China (5)
- **Countup** — each round you must plonk in a country with *more* letters than your previous round. Start with a short country name. Example: Iran (4) → Malta (5) → Greece (6) → Myanmar (7) → United Kingdom (13)

Players who break the sequence are disqualified for that round.

### Alphabetical Mode
Guesses must be in alphabetical order by country name across rounds:

- **A→Z** — each round's country must come later in the alphabet than the previous
- **Z→A** — each round's country must come earlier in the alphabet than the previous

### ABC Mode
Each round must be guessed in a country whose name starts with the next allowed letter. The allowed letters are configurable (e.g. `ABCDE` means round 1 must start with A, round 2 with B, etc.).

### Darts Mode
Players compete to get as close as possible to a target score (default 25,000) — not necessarily the highest score.

Options:
- **Target score** — configurable (default 25,000)
- **Bust** — if enabled, exceeding the target score eliminates you for that round

### Battle Royale Mode
Players get multiple guess attempts per round, with points deducted for reguesses.

Options:
- **Reguess limit** — max total guesses per round per player (default 3)
- **Points subtracted per reguess** — deducted on each reguess attempt (default 0)

### Random Plonk Only Mode
Only `!randomplonk` commands are accepted. Manual guesses are rejected.

---

## Water Plonk Modes

- **Mandatory** — all guesses must be in international waters (coast does not count). Tip: use OpenStreetMap to find water spots.
- **Illegal** — all guesses must be on land. Water plonks are rejected.

---

## Scoring Modifiers

### Multi-Guess
Players can update their guess during the round. Streaks are calculated at round end based on the final country.

### Wrong Country Penalty
Deducts a configurable number of points from guesses that land in the wrong country.

### Allow Negative Scores
Scores can go below 0 instead of being capped at 0.

### Random Multipliers
Each round may receive a random score multiplier. Multiplier is applied to all player scores for that round. Two systems available: random weighted distribution, or "Multi Merchant" mode.

---

## Visual Mods

These are toggled per-session from the game setup screen and do not affect scoring.

### Satellite Mode
Enables a satellite/aerial view for the guessing map with a configurable bounds limit (how much of the map is visible).

### Blink Mode
Hides the street view panorama and briefly reveals it at a configurable interval.

Options:
- **Time limit** — how long the panorama is shown (0.1–5 seconds, default 0.8s)
- **Round delay** — delay before first reveal each round (0.1–5 seconds, default 1s)

### No Car / No Compass (NCNC)
A collection of visual filters and element removals, toggleable individually:

| Option | Effect |
|---|---|
| No Car | Hides the car icon |
| No Compass | Hides the compass UI |
| Water | Applies a water/wave filter |
| Scramble | Distorts the image |
| Rescramble | Re-distorts on a timer (requires Scramble) |
| Pixelate | Pixelates the view |
| Greyscale | Converts to greyscale |
| Sepia | Applies sepia tone |
| Upside Down | Rotates the entire page 180° |
| CRT | CRT monitor effect |
| Toon | Cartoon/toon shader |

---

## Twitch Channel Point Rewards

These are triggered by custom channel point redemptions. The reward IDs must be configured to match your channel.

- **Disappointment Island** — forces the targeted viewer to plonk at Disappointment Island (-50.607°, 165.972°)
- **Pay2Win** — forces the redeemer to plonk at the exact correct location (guaranteed 5k)
- **Russian Roulette** — applies a hidden random penalty or effect to the redeemer

---

## Commands & Settings Differences

### Additional Twitch Commands
- `!randomplonk` / `!rp` — places a random guess (respects water plonk mode)
- `!randomplonk [countrycode]` — random guess within a specific country (if enabled)
- `!randomplonkwater` / `!taquitoplonk` — random guess in international waters
- `!mode` — shows the currently active game mode
- `!countrycode` — posts a link to country code list

### Points Gifting
Award bonus points to round or game winners via a bot command (e.g. Nightbot or StreamElements). The command and point amount are fully configurable.

### Message Customization
Every type of ChatGuessr Twitch message can be individually activated/deactivated and customized with different text.

### Custom Flags
Add custom flags by placing image files in `%AppData%\ChatGuessr\flags\`. Supported formats: `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.apng`. The filename becomes the flag command (e.g. `test.jpg` → `!flag test`).

### Other Fixes & Improvements
- Opacity reduction when hovering over flags on the results screen (to read city names behind them)
- Info box and map are hidden together with the scoreboard when hidden
- Fixed repeating "Guesses are opened" / "Round Started" messages when clicking Play Again
- Fixed random plonk issues (no avatar, players who changed name could double-plonk)
- Streamer data excluded from `!best` commands

---

## License

The ChatGuessr source is available under the [MIT License](./LICENSE).

The Montserrat font is used under the [Open Font License](https://scripts.sil.org/cms/scripts/page.php?site_id=nrsi&id=OFL).
