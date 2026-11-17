# Dueling Dukes

A medieval engine-building strategy game for 2–5 players, played in the browser on a 3D map.

Each player is a duke in a small kingdom, trying to impress the king and be named **King's Chancellor**.
You settle the land, build projects from a deck of 162 cards, trade with the capital, march regiments
to the king's banner, and now and then raid a neighbour. The structure follows the engine-building
style of *Terraforming Mars* (shared tracks that everyone pushes, production, project cards, standard
projects, milestones and awards), with a hex map of junction settlements and roads in the manner of *Catan*,
plus units that move and fight.

The full rules are in the game itself (the **Rules** button) and are summarised below.

## Playing

The game is a static web page. There is nothing to build and no server to run.

- **Online**: one player chooses *Host an online table* and shares the five-letter code or the
  invitation link. Everyone else chooses *Join a table*. Seats can also be filled with computer dukes.
- **On one device**: *Play on this device* gives solo play against computer dukes, or pass-and-play
  with several people (hands are hidden behind a hand-over screen).

### How online play works

Players' browsers connect to each other directly (WebRTC, through [PeerJS](https://peerjs.com/)).
The **host's browser keeps the game**: it checks every move against the rules and sends each player only
what that duke is allowed to see. Things to know:

- The host needs to keep the page open. If the host reloads or closes it, the title screen offers
  *Resume your table*, and the other players reconnect on their own.
- A player who drops can rejoin with the same code and gets their seat back. Meanwhile the host can
  let a bot play that seat.
- Connections are brokered by the free public PeerJS service. Very strict corporate or school networks
  can block peer-to-peer connections. To use your own broker, add `?broker=host:port` to the address.
- Because the host's browser holds the whole game, play online with people you trust not to open the
  developer console.

### Putting it on the web

Any static host works. For GitHub Pages: merge this branch into `main`, then in the repository settings
choose **Pages → Deploy from a branch → `main` / root**. The game is then at
`https://<user>.github.io/DuelingDukes/`.

To run it locally:

```bash
python3 -m http.server 8080
```

then open `http://localhost:8080`. (It must be served over http; opening `index.html` as a file will
not load the scripts.)

## Rules summary

**Aim.** Have the most Royal Favor plus Favor Points when the game ends. Royal Favor starts at 20 and
is also income: each year you collect Gold equal to your Royal Favor plus your Gold production.

**The three tracks.** Power (10 ranks), Faith (15) and Wealth (20). Whoever raises a track gains
1 Royal Favor per rank. When all three are full, the game ends after that year.

**The map.** Towns, cities and units stand on the junctions where hexes meet; roads run along edges.
A settlement gains +1 production per neighbouring hex: Grassland → Food, Hills → Stone, Forest →
Raw Materials, Ore Mountains → Ore, Water → Gold. Mountains produce nothing but fortify the settlement.

**A year.** Research (draw 4 cards, buy any for 3 Gold each), then actions: in turn order each duke
takes one or two actions, until everyone has passed. At year's end each town turns 1 unspent Raw
Material into a Luxury and each city 2; then production arrives.

**Standard improvements** (missing Stone, Ore or Food can be bought at 3 Gold each):

| Improvement | Cost | Effect |
|---|---|---|
| Build Road | 2 Gold, 1 Stone | +1 Gold production each time your roads link another settlement |
| Recruit Settlers | 3 Gold, 4 Food | Settlers appear at one of your settlements |
| Found Town | 3 Gold, 3 Stone | Settlers become a town where they stand |
| Raise City | 8 Gold, 4 Stone | Town becomes a city; +2 to one of its productions |
| Recruit Caravan | 5 Gold, 1 Food | A Caravan appears at one of your settlements |
| Build Church | 8 Gold, 3 Stone | Raise Faith 1 rank |
| Upgrade to Cathedral | 10 Gold, 5 Stone | In a city with a church: raise Faith 1 rank, worth 1 Favor Point |
| Form Regiment | 2 Gold, 2 Ore, 2 Food | Soldiers appear at one of your settlements |
| Upgrade Regiment | 3 Gold, 2 Ore | Soldiers become Knights |
| Royal Tribute | 18 Gold | Raise Wealth 1 rank |
| Establish Trading Post | 10 Gold | See the Trade Track |

**Standard actions.** Move a unit; donate a regiment at the kingdom's capital (Power +1); supply
8 Luxuries (Wealth +1); trade with the capital; trade with a duke; skirmish; raid; claim a Title;
fund an Honor; sell cards or goods for 1 Gold each.

**The Trade Track.** One shared tracker with a marker for each of Gold, Stone, Ore, Food, Raw Materials,
Luxuries and Cards. With a Caravan at the kingdom's capital, pay 3 Raw Materials, 3 Ore or 9 Gold to
collect the value under one marker; that marker then drops back to its floor. Every marker that nobody
traded for climbs one step at year's end. Each marker can be traded once a year, each Caravan trades
once a year. A Trading Post raises its marker's floor by a step and pays its owner a little whenever
anyone trades there.

**Cards.** Projects (green), Standing cards with lasting effects or once-a-year actions (blue), and
Events (red). Tags let goods help pay: Stone for Building (2 Gold each), Ore for Military (3),
Raw Materials for Trade (3), Food for Farming (2), Luxuries for Court (2).

**Units.** One unit per junction, except at the kingdom's capital, which is neutral ground. Settlers
and Soldiers move 2 edges a year, Caravans 3, Knights 4; edges with a road are free. Rivals' units
block you unless their duke grants you passage.

**War.** Soldiers (strength 1) and Knights (2) can attack a rival unit on a neighbouring junction.
The stronger side wins; equal strength destroys both; a unit in its own settlement defends at +1.
Settlers and Caravans are routed home and you plunder 2 Gold. Soldiers or Knights standing in a
rival's town or city can raid it for goods. Towns and cities never change hands, and duchy capitals
admit only Caravans.

**Final scoring.** Royal Favor + Favor Points on cards + 1 per town + 2 per city + 1 per cathedral +
5 per Title + Honors (5 to the leader, 2 to the runner-up).

## Where the design filled gaps in the brief

The original description left a number of things open. These are the choices made, all of them
constants in `js/engine/data.js` or `js/engine/cards.js` and easy to change:

- **End of the game**: at the end of the year in which all three tracks are full.
- **Royal Favor as income**, starting at 20, as Terraform Rating works in Terraforming Mars.
- **Luxuries** come from Raw Materials you did *not* spend during the year, converted before production
  arrives. That makes trading (3 Raw Materials) and Luxuries compete for the same goods.
- **Royal Tribute** (18 Gold for a Wealth rank) exists so that Wealth can always be pushed, as the
  standard projects do in Terraforming Mars.
- **Raise City** is a standard improvement (the brief mentions upgrading towns but did not list it).
- **Noble houses** play the part of corporations: ten of them, each duke choosing one of two.
- **Titles and Honors** play the part of milestones and awards.
- **Bounties** on some hexes reward the first settlement beside them, like placement bonuses.
- **Trading Posts** are the Colonies-style "colony" on the Trade Track.
- **Combat** is deterministic (no dice), and limited to skirmishes and raids, as agreed.
- **Passage** through rival units is a standing permission each duke sets per rival, rather than a
  question asked on every move, so that online play never stalls.
- **Selling goods** at 1 Gold each is a release valve for late-game surpluses.
- Map size: 61 hexes for 2–3 dukes, 91 for 4–5; "Lakeland" and "Coastal" layouts.

## Project layout

```
index.html            the page
css/style.css         all styling
js/engine/            the rules, with no browser dependencies
  data.js             costs, tracks, Trade Track tables, houses, titles, honors
  cards.js            the 162 project cards, as data
  map.js              hex geometry and map generation
  engine.js           game state, legal-move checks, every action, scoring
  describe.js         generates card text from card data
  bot.js              the computer dukes
js/net.js             host and client sessions (peer-to-peer play, saving, bots)
js/ui/                title screen, lobby, 3D board (three.js), game screen
vendor/               three.js and PeerJS (both MIT-licensed), vendored so the game has no build step
test/                 rule checks and bot-against-bot simulations
```

## Tests

```bash
node test/rules.mjs      # targeted checks of individual rules
node test/sim.mjs 100    # 100 complete bot-against-bot games, checking invariants throughout
```

Simulated games finish in about 11 years on average (9 to 15).

`test/browser/` holds end-to-end scripts that drive the real page in headless Chromium: a whole game,
real mouse clicks on the 3D board, every interaction dialog, pass-and-play with resume, and two
browsers playing online. They need [Playwright](https://playwright.dev/) and the local server above;
`online.mjs` also needs a local PeerJS broker (`npx peerjs --port 9000 --path / -H 127.0.0.1`).
Each takes a folder for screenshots, for example `node test/browser/online.mjs /tmp/shots`.
