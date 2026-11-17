// Static rules data: resources, costs, tracks, the Trade Track, houses,
// titles and honours. Everything a rules tweak would touch lives here or in
// cards.js.

export const RES = ['gold', 'stone', 'ore', 'food', 'rm', 'lux'];
export const PROD_RES = ['gold', 'stone', 'ore', 'food', 'rm'];
export const RES_NAME = {
  gold: 'Gold', stone: 'Stone', ore: 'Ore', food: 'Food', rm: 'Raw Materials', lux: 'Luxuries', card: 'Cards',
};
export const RES_SHORT = {
  gold: 'Gold', stone: 'Stone', ore: 'Ore', food: 'Food', rm: 'Materials', lux: 'Luxuries', card: 'Cards',
};

export const START_RF = 20;
export const MIN_GOLD_PROD = -5;
export const CARD_BUY_COST = 3;
export const RESEARCH_DRAW = 4;
export const START_HAND = 10;
export const SUBSTITUTE_COST = 3; // Gold per missing Stone / Ore / Food on standard improvements
export const LUX_PER_WEALTH = 8;
export const DUKE_TRADE_MAX = 5;
export const KNIGHT_DONATION_GOLD = 5;
export const PLUNDER_GOLD = 2;
export const SELLABLE = ['stone', 'ore', 'food', 'rm', 'lux'];
export const SELL_PRICE = 1; // Gold per good sold at market: a poor rate, but always open

export const TRACKS = {
  power: {
    name: 'Power', max: 10, blurb: 'The kingdom’s military might',
    bonus: { 3: [['gain', 'ore', 2]], 6: [['draw', 1]], 9: [['gain', 'gold', 5]] },
  },
  faith: {
    name: 'Faith', max: 15, blurb: 'The kingdom’s devotion',
    bonus: { 4: [['draw', 1]], 8: [['prod', 'gold', 1]], 12: [['draw', 2]] },
  },
  wealth: {
    name: 'Wealth', max: 20, blurb: 'The kingdom’s prosperity',
    bonus: { 5: [['prod', 'gold', 1]], 10: [['gain', 'lux', 3]], 15: [['prod', 'gold', 1]] },
  },
};
export const TRACK_IDS = ['power', 'faith', 'wealth'];

export const UNITS = {
  settlers: { name: 'Settlers', move: 2, str: 0 },
  soldiers: { name: 'Soldiers', move: 2, str: 1, loot: 2 },
  knights: { name: 'Knights', move: 4, str: 2, loot: 3 },
  caravan: { name: 'Caravan', move: 3, str: 0 },
};

// Standard improvements. Missing Stone/Ore/Food may be bought at 3 Gold each.
export const STD = {
  road: { name: 'Build Road', cost: { stone: 1, gold: 2 }, text: 'Place a road beside one of your roads, towns or cities. Each new link between settlements gives +1 Gold production.' },
  settlers: { name: 'Recruit Settlers', cost: { food: 4, gold: 3 }, text: 'Put Settlers into play at one of your towns or cities.' },
  town: { name: 'Found Town', cost: { stone: 3, gold: 3 }, text: 'Turn Settlers into a Town where they stand. It produces +1 for every neighbouring hex.' },
  city: { name: 'Raise City', cost: { stone: 4, gold: 8 }, text: 'Upgrade a Town to a City and raise one of its productions by +2.' },
  caravan: { name: 'Recruit Caravan', cost: { food: 1, gold: 5 }, text: 'Put a Caravan into play at one of your towns or cities.' },
  church: { name: 'Build Church', cost: { stone: 3, gold: 8 }, text: 'Put a Church in one of your towns or cities. Raise Faith 1 rank.' },
  cathedral: { name: 'Upgrade to Cathedral', cost: { stone: 5, gold: 10 }, text: 'Turn a Church in a city into a Cathedral. Raise Faith 1 rank. Worth 1 Favor Point.' },
  soldiers: { name: 'Form Regiment', cost: { food: 2, ore: 2, gold: 2 }, text: 'Put Soldiers into play at one of your towns or cities.' },
  knights: { name: 'Upgrade Regiment', cost: { ore: 2, gold: 3 }, text: 'Replace one of your Soldiers units with Knights.' },
  tribute: { name: 'Royal Tribute', cost: { gold: 18 }, text: 'Pay the crown directly. Raise Wealth 1 rank.' },
  post: { name: 'Establish Trading Post', cost: { gold: 10 }, text: 'Needs your Caravan at the kingdom’s capital. Place a post on one Trade Track marker.' },
};
export const STD_ORDER = ['road', 'settlers', 'town', 'city', 'caravan', 'church', 'cathedral', 'soldiers', 'knights', 'tribute', 'post'];

// The Trade Track. One shared tracker; every marker sits on a step 0..6.
// A marker that nobody trades for climbs one step at year's end; trading for
// it pays out the step's value and drops the marker back to its floor
// (one step per Trading Post on that marker).
export const TRADE_STEPS = 7;
export const TRADE_MARKERS = ['gold', 'stone', 'ore', 'food', 'rm', 'lux', 'card'];
export const TRADE_TABLE = {
  gold: [3, 5, 8, 11, 14, 18, 22],
  stone: [1, 2, 3, 5, 6, 8, 10],
  ore: [1, 2, 3, 4, 5, 6, 8],
  food: [1, 2, 3, 5, 6, 8, 10],
  rm: [1, 2, 3, 4, 5, 7, 9],
  lux: [1, 2, 4, 5, 7, 9, 12],
  card: [1, 1, 2, 2, 3, 4, 5],
};
export const TRADE_START = 1;
export const TRADE_COST = { rm: 3, ore: 3, gold: 9 };
export const MAX_POSTS = 3;

export const TAGS = ['building', 'military', 'trade', 'farming', 'faith', 'scholar', 'court'];
export const TAG_NAME = {
  building: 'Building', military: 'Military', trade: 'Trade', farming: 'Farming', faith: 'Faith', scholar: 'Scholar', court: 'Court',
};
// Which stockpiled resource may be spent on cards with a tag, and what one unit is worth in Gold.
export const TAG_PAY = {
  building: { res: 'stone', value: 2 },
  military: { res: 'ore', value: 3 },
  trade: { res: 'rm', value: 3 },
  farming: { res: 'food', value: 2 },
  court: { res: 'lux', value: 2 },
};

export const HOUSES = [
  { id: 'aurelis', name: 'House Aurelis', motto: 'The Merchant Princes', gold: 42, tags: ['trade'],
    start: [['unit', 'caravan']], fxp: { tradeDiscount: 1 } },
  { id: 'ferrum', name: 'House Ferrum', motto: 'Lords of the Deep Mines', gold: 36, tags: ['military'],
    start: [['prod', 'ore', 1], ['gain', 'ore', 3]], fxp: { value: { ore: 1 } } },
  { id: 'lapidar', name: 'House Lapidar', motto: 'The Master Builders', gold: 38, tags: ['building'],
    start: [['prod', 'stone', 1], ['gain', 'stone', 4]], fxp: { std: { '*': { stone: -1 } } } },
  { id: 'sanctus', name: 'House Sanctus', motto: 'Defenders of the Faith', gold: 38, tags: ['faith'],
    start: [], fxp: { std: { church: { gold: -2 }, cathedral: { gold: -2 } }, on: [{ when: 'track', track: 'faith', who: 'self', fx: [['gain', 'gold', 3]] }] } },
  { id: 'verdane', name: 'House Verdane', motto: 'Keepers of the Green Fields', gold: 36, tags: ['farming'],
    start: [['prod', 'food', 2], ['gain', 'food', 3]], fxp: { std: { settlers: { food: -2 } } } },
  { id: 'martel', name: 'House Martel', motto: 'The Iron Banner', gold: 34, tags: ['military'],
    start: [['unit', 'soldiers']], fxp: { std: { soldiers: { ore: -1 } }, move: { soldiers: 1 } } },
  { id: 'sapiens', name: 'House Sapiens', motto: 'Patrons of Learning', gold: 40, tags: ['scholar'],
    start: [['draw', 3]], fxp: { cardBuy: -1 } },
  { id: 'opulus', name: 'House Opulus', motto: 'The Gilded Court', gold: 38, tags: ['court'],
    start: [['gain', 'lux', 4]], fxp: { luxCost: -1 } },
  { id: 'viator', name: 'House Viator', motto: 'Wardens of the Roads', gold: 40, tags: [],
    start: [['roads', 2]], fxp: { move: { settlers: 1, caravan: 1 } } },
  { id: 'regalis', name: 'House Regalis', motto: 'Friends of the Crown', gold: 42, tags: ['court'],
    start: [['rf', 1]], fxp: { on: [{ when: 'playTag', tag: 'court', who: 'self', fx: [['gain', 'gold', 2]] }] } },
];
export const HOUSE_BY_ID = Object.fromEntries(HOUSES.map((h) => [h.id, h]));

export const TITLE_COST = 8;
export const TITLE_FP = 5;
export const MAX_TITLES = 3;
export const TITLES = [
  { id: 'mayor', name: 'Lord Mayor', text: 'Own 3 cities (your duchy capital counts).', what: 'cities', n: 3 },
  { id: 'warden', name: 'Road Warden', text: 'Have 7 roads.', what: 'roads', n: 7 },
  { id: 'patron', name: 'Patron of the Church', text: 'Have 3 churches or cathedrals.', what: 'churches', n: 3 },
  { id: 'marshal', name: 'Lord Marshal', text: 'Have 3 Soldiers or Knights in play.', what: 'military', n: 3 },
  { id: 'builder', name: 'Master Builder', text: 'Have 6 Building tags.', what: 'tag:building', n: 6 },
  { id: 'favorite', name: 'Royal Favorite', text: 'Reach 32 Royal Favor.', what: 'rf', n: 32 },
];
export const HONOR_COSTS = [8, 14, 20];
export const HONOR_FP = [5, 2];
export const HONORS = [
  { id: 'landowner', name: 'Great Landowner', text: 'Most towns and cities.', what: 'settlements' },
  { id: 'treasurer', name: 'Royal Treasurer', text: 'Highest Gold production.', what: 'prod:gold' },
  { id: 'merchant', name: 'Merchant Prince', text: 'Most trades made (with the capital or with dukes).', what: 'trades' },
  { id: 'warlord', name: 'Warlord', text: 'Most Power ranks raised.', what: 'raised:power' },
  { id: 'devout', name: 'Most Devout', text: 'Most Faith ranks raised.', what: 'raised:faith' },
];

export const FP_TOWN = 1;
export const FP_CITY = 2;
export const FP_CATHEDRAL = 1;

export const PLAYER_COLORS = [
  { id: 'crimson', name: 'Crimson', hex: '#b3261e' },
  { id: 'azure', name: 'Azure', hex: '#2f6fd0' },
  { id: 'gold', name: 'Amber', hex: '#d99a1c' },
  { id: 'forest', name: 'Emerald', hex: '#2e8b57' },
  { id: 'violet', name: 'Violet', hex: '#7d4bc4' },
];
