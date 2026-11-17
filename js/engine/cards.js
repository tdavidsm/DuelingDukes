// The project deck.
//
// Card types:  'project' (green, one-time build), 'active' (blue, lasting
// effect or a once-per-year action), 'event' (red, one-time; its tags do not
// stay in play).
//
// Effect language (fx): arrays, run in order for the card's owner.
//   ['prod', res, n]             change production
//   ['gain', res, n]             gain (or, if negative, spend) resources
//   ['track', track, n]          raise Power / Faith / Wealth (1 Royal Favor per rank)
//   ['rf', n]                    gain Royal Favor directly
//   ['draw', n]                  draw cards
//   ['unit', type]               place a free unit at one of your settlements
//   ['roads', n]                 place n free roads
//   ['steal', res, n]            take up to n from a rival of your choice
//   ['harm', res, n]             a rival of your choice loses up to n
//   ['harmProd', res, n]         a rival of your choice loses production
//   ['harmAll', res, n]          every rival loses up to n
//   ['gainPer', res, n, what, div]  gain n per (count of what / div)
//   ['prodPer', res, n, what, div]  production per (count of what / div)
//   ['choose', n, [res...]]      gain n of one resource you choose
//   ['counter', n]               add counters to this card
//   ['protect']                  King's Peace until the end of next year
//   ['advanceTrade', n]          every Trade Track marker climbs n steps
//   ['resetMove']                all your units regain their movement
//
// Passive effects (fxp) and triggers are interpreted by engine.js `mods()`.

const list = [];
function c(name, cost, type, tags, props = {}) {
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  list.push({ id, name, cost, type, tags, ...props });
}
const P = 'project';
const A = 'active';
const E = 'event';

// ---------------------------------------------------------------- Building
c('Stone Quarry', 10, P, ['building'], { fx: [['prod', 'stone', 2]], flavor: 'The hills give up their bones.' });
c('Watermill', 9, P, ['building', 'farming'], { fx: [['prod', 'food', 1], ['prod', 'gold', 1]], flavor: 'The river does the work of twenty men.' });
c('Sawmill', 11, P, ['building'], { fx: [['prod', 'rm', 1], ['gain', 'rm', 2]] });
c('Deep Mine', 15, P, ['building'], { fx: [['prod', 'ore', 2]], flavor: 'Deeper. Always deeper.' });
c('Market Hall', 13, P, ['building', 'trade'], { fx: [['prod', 'gold', 3]] });
c('Granary', 7, P, ['building', 'farming'], { fx: [['gain', 'food', 4], ['prod', 'food', 1]] });
c('Castle Keep', 14, A, ['building', 'military'], { fxp: { def: 1 }, fp: 1, flavor: 'Let them come.' });
c('Stone Bridge', 6, P, ['building'], { fx: [['roads', 2]] });
c("King's Highway", 14, P, ['building', 'trade'], { fx: [['roads', 3], ['prod', 'gold', 1]] });
c('Town Walls', 8, A, ['building'], { fxp: { raidImmune: true }, fp: 1 });
c('Great Hall', 17, P, ['building', 'court'], { fx: [['prod', 'gold', 2]], fp: 2 });
c("Masons' Guild", 11, A, ['building'], { fxp: { value: { stone: 1 } } });
c("Blacksmiths' Guild", 13, A, ['building', 'military'], { fxp: { value: { ore: 1 } } });
c('Guildhall', 14, A, ['building', 'trade'], { fxp: { discount: { all: 1 } }, fp: 1 });
c('Aqueduct', 16, P, ['building'], { req: { cities: 2 }, fx: [['prod', 'food', 1], ['prod', 'gold', 2]], fp: 1 });
c('Lighthouse', 9, P, ['building', 'trade'], { fx: [['prod', 'gold', 2]] });
c('Brickworks', 8, A, ['building'], { fxp: { std: { '*': { stone: -1 } } } });
c('Beacon Towers', 7, A, ['building', 'military'], { fxp: { move: { soldiers: 1, knights: 1 } } });
c('University', 18, A, ['building', 'scholar'], { req: { cities: 2 }, fx: [['draw', 2]], act: { pay: { gold: 2 }, fx: [['draw', 1]] }, fp: 2 });
c('Royal Mint', 20, P, ['building', 'court'], { req: { wealth: [5, 99] }, fx: [['prod', 'gold', 5]] });
c('Tavern', 5, P, ['building'], { fx: [['prod', 'gold', 1], ['gain', 'gold', 2]], flavor: 'Every road ends at a warm hearth.' });
c('Harbor', 13, P, ['building', 'trade'], { fx: [['prod', 'gold', 2], ['gain', 'rm', 2]] });
c('Windmill', 10, P, ['building', 'farming'], { fx: [['prod', 'food', 2]] });
c("Stonemasons' Lodge", 6, P, ['building'], { fx: [['gain', 'stone', 5]] });
c('Foundry', 10, A, ['building', 'military'], { act: { pay: { gold: 4 }, fx: [['gain', 'ore', 2]] } });
c('Bathhouse', 10, P, ['building', 'court'], { fx: [['gain', 'lux', 3]], fp: 1 });
c('Clocktower', 11, P, ['building', 'scholar'], { req: { tags: { scholar: 1 } }, fp: 2 });
c('Fortress', 22, P, ['building', 'military'], { req: { power: [3, 99] }, fx: [['track', 'power', 1]], fp: 2 });
c('Grand Bazaar', 19, P, ['building', 'trade'], { fx: [['track', 'wealth', 1], ['prod', 'gold', 1]] });

// ---------------------------------------------------------------- Military
c('Mercenary Company', 8, E, ['military'], { fx: [['unit', 'soldiers']], flavor: 'Loyal to the last coin.' });
c('Knightly Order', 17, P, ['military', 'court'], { fx: [['unit', 'knights']], fp: 1 });
c('Border Raid', 5, E, ['military'], { req: { military: 1 }, fx: [['steal', 'gold', 5]] });
c('Cattle Raid', 4, E, ['military'], { req: { military: 1 }, fx: [['steal', 'food', 4]] });
c('Scorched Fields', 5, E, ['military'], { fx: [['harmProd', 'food', 1]] });
c('Mine Sabotage', 6, E, ['military'], { fx: [['harmProd', 'ore', 1]] });
c('Royal Tournament', 13, E, ['military', 'court'], { fx: [['track', 'power', 1]], flavor: 'Lances shatter; reputations are made.' });
c('Muster the Levies', 17, E, ['military'], { fx: [['track', 'power', 1], ['unit', 'soldiers']] });
c('Grand Army Parade', 24, E, ['military'], { req: { military: 2 }, fx: [['track', 'power', 2]] });
c('Armory', 10, A, ['military', 'building'], { fxp: { std: { soldiers: { ore: -1 }, knights: { ore: -1 } } } });
c('War College', 14, A, ['military', 'scholar'], { fxp: { str: 1 }, fp: 1 });
c('Stables', 8, A, ['military', 'farming'], { fxp: { move: { knights: 1, caravan: 1, settlers: 1 } } });
c('Conscription', 9, E, ['military'], { fx: [['prod', 'gold', -1], ['unit', 'soldiers'], ['unit', 'soldiers']] });
c('Royal Garrison', 18, P, ['military', 'building'], { fx: [['track', 'power', 1]] });
c('Siege Engineers', 9, A, ['military', 'scholar'], { fxp: { loot: 1 } });
c('Tribute from the Marches', 14, P, ['military'], { req: { power: [4, 99] }, fx: [['prod', 'gold', 2], ['prod', 'ore', 1]] });
c('Veteran Captains', 7, A, ['military'], { fxp: { on: [{ when: 'track', track: 'power', who: 'self', fx: [['gain', 'gold', 4]] }] } });
c('Crusade', 25, E, ['military', 'faith'], { req: { faith: [5, 99] }, fx: [['track', 'power', 1], ['track', 'faith', 1]] });
c('Bandit Ambush', 4, E, ['military'], { fx: [['harm', 'rm', 4]] });
c('Weaponsmith', 10, P, ['military'], { fx: [['prod', 'ore', 1], ['gain', 'ore', 2]] });
c('Forced March', 3, E, ['military'], { fx: [['resetMove']], flavor: 'Sleep is for the garrison.' });
c('Holy Order', 20, P, ['military', 'faith'], { fx: [['track', 'faith', 1], ['unit', 'soldiers']] });
c('Marcher Lords', 12, P, ['military', 'court'], { req: { power: [2, 99] }, fx: [['prodPer', 'gold', 1, 'military', 1], ['gain', 'ore', 2]] });
c('Victory Triumph', 11, E, ['military', 'court'], { req: { power: [6, 99] }, fx: [['rf', 1]] });

// ------------------------------------------------------------------- Trade
c('Merchant Guild', 12, A, ['trade'], { fxp: { tradeDiscount: 1 } });
c('Trade Fair', 7, E, ['trade'], { fx: [['gain', 'gold', 4], ['gainPer', 'gold', 2, 'tag:trade', 1]] });
c('Caravanserai', 10, P, ['trade', 'building'], { fx: [['unit', 'caravan'], ['prod', 'gold', 1]] });
c('Silk Road Charter', 13, A, ['trade'], { fxp: { on: [{ when: 'trade', who: 'self', fx: [['gain', 'lux', 2]] }] } });
c("Weavers' Guild", 12, A, ['trade'], { fxp: { convert: { bonus: 2 } } });
c('Warehouses', 7, A, ['trade', 'building'], { fxp: { convert: { keep: 3 } } });
c('Workshops', 9, A, ['trade', 'building'], { fxp: { convert: { cap: 3 } } });
c('Vintners', 13, P, ['trade', 'farming'], { fx: [['prod', 'rm', 1], ['prod', 'food', 1]] });
c('Wool Trade', 16, P, ['trade', 'farming'], { fx: [['prod', 'rm', 2]] });
c('Banking House', 16, P, ['trade', 'court'], { req: { wealth: [3, 99] }, fx: [['prod', 'gold', 4]] });
c('Money Lenders', 3, P, ['trade'], { fx: [['gain', 'gold', 12], ['prod', 'gold', -2]], flavor: 'Gold today. Regret tomorrow.' });
c('Royal Monopoly', 12, P, ['trade', 'court'], { fx: [['prod', 'gold', 3], ['harmProd', 'gold', 1]] });
c('Smugglers', 5, E, ['trade'], { fx: [['steal', 'lux', 3]] });
c('Merchant Fleet', 15, P, ['trade'], { fx: [['prod', 'gold', 2], ['advanceTrade', 1]] });
c('Toll Roads', 10, P, ['trade', 'building'], { fx: [['prodPer', 'gold', 1, 'roads', 2]] });
c('Exotic Imports', 7, E, ['trade'], { fx: [['gain', 'lux', 5]] });
c('Bulk Purchase', 6, E, ['trade'], { fx: [['choose', 4, ['stone', 'food', 'rm']]] });
c('Trade Embargo', 7, E, ['trade', 'court'], { fx: [['harmProd', 'gold', 2]] });
c('Market Day', 4, E, ['trade'], { fx: [['gainPer', 'gold', 2, 'settlements', 1]] });
c('Goldsmiths', 11, A, ['trade'], { act: { pay: { gold: 4 }, fx: [['gain', 'lux', 2]] } });
c('Merchant League', 12, A, ['trade'], { fp: { per: 'tag:trade', div: 2 } });
c('Salt Road', 11, P, ['trade'], { fx: [['prod', 'gold', 2], ['gain', 'rm', 2]] });
c('Cloth Fair', 15, E, ['trade'], { fx: [['track', 'wealth', 1]] });
c('Royal Treasure Fleet', 27, E, ['trade', 'court'], { fx: [['track', 'wealth', 2]] });
c('Guild Masterpiece', 11, E, ['trade'], { req: { tags: { trade: 2 } }, fx: [['track', 'wealth', 1]] });
c('Spice Merchants', 9, P, ['trade'], { fx: [['gain', 'lux', 3], ['prod', 'gold', 1]] });
c('Wandering Peddlers', 5, E, ['trade'], { fx: [['choose', 3, ['ore', 'lux', 'rm']]] });

// ----------------------------------------------------------------- Farming
c('Fertile Fields', 9, P, ['farming'], { fx: [['prod', 'food', 2]] });
c('Orchards', 13, P, ['farming'], { fx: [['prod', 'food', 1], ['prod', 'rm', 1]] });
c('Sheep Pastures', 11, P, ['farming'], { fx: [['prod', 'rm', 1], ['gain', 'rm', 2]] });
c('Fishing Fleet', 9, P, ['farming', 'trade'], { fx: [['prod', 'food', 1], ['prod', 'gold', 1]] });
c('Harvest Festival', 5, E, ['farming'], { fx: [['gain', 'food', 3], ['gainPer', 'food', 1, 'tag:farming', 1]] });
c('Royal Feast', 5, E, ['farming', 'court'], { fx: [['gain', 'food', -5], ['track', 'wealth', 1]], flavor: 'Forty courses, and the king asked for more.' });
c('Three-Field System', 11, A, ['farming', 'scholar'], { fx: [['prod', 'food', 1]], fxp: { std: { settlers: { food: -2 } } } });
c('Beekeepers', 7, P, ['farming'], { fx: [['prod', 'gold', 1], ['gain', 'lux', 2]] });
c('Hunting Grounds', 9, P, ['farming', 'court'], { fx: [['prod', 'food', 1]], fp: 1 });
c('Irrigation', 15, P, ['farming', 'building'], { fx: [['prodPer', 'food', 1, 'settlements', 1]] });
c('Peasant Migration', 8, E, ['farming'], { fx: [['unit', 'settlers']] });
c("Colonists' Charter", 9, A, ['court', 'farming'], { fxp: { on: [{ when: 'foundTown', who: 'self', fx: [['gain', 'gold', 5]] }] } });
c('Famine', 5, E, ['farming'], { fx: [['harm', 'food', 5]] });
c('Livestock Market', 9, A, ['farming', 'trade'], { act: { pay: { food: 2 }, fx: [['gain', 'gold', 5]] } });
c('Herbalists', 8, P, ['farming', 'scholar'], { fx: [['draw', 1], ['prod', 'food', 1]] });
c('Crop Rotation', 5, P, ['farming'], { fx: [['prod', 'food', 1]] });
c('Great Harvest', 3, E, ['farming'], { fx: [['gain', 'food', 6]] });
c('Royal Forest', 12, P, ['farming', 'court'], { fx: [['prod', 'rm', 1]], fp: 1 });
c('Prize Herds', 8, A, ['farming'], { act: { fx: [['counter', 1]] }, fp: { counter: 2 } });
c('Wine Cellars', 9, P, ['farming', 'court'], { fx: [['gain', 'lux', 3]], fp: 1 });
c('Heavy Plough', 10, P, ['farming', 'scholar'], { fx: [['prod', 'food', 2]] });
c('Flax Fields', 8, P, ['farming', 'trade'], { fx: [['prod', 'rm', 1]] });

// ------------------------------------------------------------------- Faith
c('Pilgrimage', 14, E, ['faith'], { fx: [['track', 'faith', 1]], flavor: 'A thousand miles on blistered feet.' });
c('Holy Relic', 9, P, ['faith'], { req: { churches: 1 }, fp: 2 });
c('Monastery', 18, P, ['faith', 'building'], { fx: [['track', 'faith', 1], ['draw', 1]] });
c('Abbey Brewery', 8, P, ['faith', 'farming'], { req: { churches: 1 }, fx: [['prod', 'gold', 2]] });
c('Tithes', 10, P, ['faith'], { fx: [['prodPer', 'gold', 1, 'churches', 1], ['prod', 'gold', 1]] });
c('Scriptorium', 12, A, ['faith', 'scholar'], { fxp: { on: [{ when: 'playTag', tag: 'faith', who: 'self', fx: [['draw', 1]] }] } });
c('Blessing of the Harvest', 7, E, ['faith', 'farming'], { req: { faith: [3, 99] }, fx: [['gain', 'food', 4], ['prod', 'food', 1]] });
c("Saint's Day Procession", 6, E, ['faith'], { fx: [['gain', 'gold', 2], ['gainPer', 'gold', 4, 'churches', 1]] });
c('Cathedral School', 12, P, ['faith', 'scholar'], { req: { cathedrals: 1 }, fx: [['draw', 3]], fp: 1 });
c('Papal Legate', 26, E, ['faith', 'court'], { fx: [['track', 'faith', 2]] });
c('Indulgences', 8, A, ['faith'], { act: { pay: { gold: 7 }, fx: [['counter', 1]] }, fp: { counter: 1 } });
c('Hermitage', 4, P, ['faith'], { req: { faith: [0, 5] }, fp: 1 });
c('Reliquary', 8, A, ['faith'], { fxp: { on: [{ when: 'track', track: 'faith', who: 'any', fx: [['counter', 1]] }] }, fp: { counter: 3 } });
c('Mission to the Marches', 11, E, ['faith'], { req: { settlements: 3 }, fx: [['track', 'faith', 1]] });
c("Bishop's Blessing", 4, E, ['faith', 'court'], { fx: [['gain', 'gold', 3], ['gainPer', 'gold', 3, 'tag:faith', 1]] });
c('Charity Hospice', 11, P, ['faith', 'building'], { fp: 2 });
c('Church Bells', 6, A, ['faith', 'building'], { fxp: { std: { church: { gold: -3 }, cathedral: { gold: -3 } } } });
c('Excommunication', 6, E, ['faith'], { req: { faith: [6, 99] }, fx: [['harmProd', 'gold', 2]] });
c('Devout Patrons', 8, A, ['faith', 'court'], { fxp: { on: [{ when: 'track', track: 'faith', who: 'self', fx: [['gain', 'gold', 3]] }] } });
c('Wayside Shrines', 9, P, ['faith'], { fx: [['gainPer', 'gold', 1, 'roads', 1]], fp: 1 });
c('Great Revival', 16, E, ['faith'], { req: { churches: 2 }, fx: [['track', 'faith', 1], ['gain', 'gold', 4]] });

// ----------------------------------------------------------------- Scholar
c('Royal Library', 12, A, ['scholar', 'building'], { fxp: { cardBuy: -1 }, fp: 1 });
c('Alchemist', 10, A, ['scholar'], { act: { pay: { stone: 2 }, fx: [['gain', 'gold', 6]] }, flavor: 'Lead into gold? No. Stone into gold? Occasionally.' });
c('Cartographers', 7, P, ['scholar'], { fx: [['draw', 2]] });
c('Royal Astronomer', 9, P, ['scholar', 'court'], { fx: [['draw', 1]], fp: 1 });
c("Engineers' Corps", 12, A, ['scholar', 'building'], { fxp: { discount: { building: 2 } } });
c('Chroniclers', 9, A, ['scholar', 'court'], { fxp: { on: [{ when: 'track', track: 'any', who: 'any', fx: [['gain', 'gold', 1]] }] } });
c("Philosophers' Circle", 9, A, ['scholar'], { fxp: { on: [{ when: 'playTag', tag: 'scholar', who: 'self', fx: [['gain', 'gold', 3]] }] } });
c('Academy', 11, A, ['scholar'], { fp: { per: 'tag:scholar', div: 2 } });
c('Printing Press', 17, A, ['scholar', 'trade'], { req: { tags: { scholar: 2 } }, fxp: { discount: { all: 2 } } });
c('Surveyors', 6, E, ['scholar'], { fx: [['roads', 1], ['draw', 1]] });
c('Physician', 7, P, ['scholar'], { fx: [['gain', 'food', 2]], fp: 1 });
c('Tutor to the Prince', 12, P, ['scholar', 'court'], { req: { tags: { scholar: 2 } }, fx: [['rf', 1]] });
c("Mapmakers' Guild", 6, A, ['scholar', 'trade'], { fxp: { move: { settlers: 1, caravan: 1 } } });
c('Experimental Forge', 12, P, ['scholar', 'military'], { fx: [['prod', 'ore', 1], ['draw', 1]] });
c('Royal Observatory', 15, P, ['scholar', 'building'], { req: { tags: { scholar: 3 } }, fx: [['draw', 2]], fp: 3 });
c('Travelling Scholar', 3, E, ['scholar'], { fx: [['draw', 2], ['gain', 'gold', -1]] });

// ------------------------------------------------------------------- Court
c('Royal Wedding', 16, E, ['court'], { fx: [['track', 'wealth', 1], ['draw', 1]], flavor: 'The whole kingdom was invited. The bill went to you.' });
c('Gift to the Queen', 4, E, ['court'], { fx: [['gain', 'lux', -4], ['track', 'wealth', 1]] });
c('Minstrels', 6, P, ['court'], { fx: [['gain', 'gold', 2]], fp: 1 });
c('Royal Charter', 11, P, ['court'], { fx: [['prod', 'gold', 2], ['draw', 1]] });
c("Lord Chamberlain's Ear", 13, P, ['court'], { req: { tags: { court: 2 } }, fx: [['rf', 1]] });
c('Royal Hunt', 7, E, ['court', 'farming'], { fx: [['gain', 'food', 4], ['gain', 'lux', 2]] });
c('Tax Collectors', 12, P, ['court'], { fx: [['prodPer', 'gold', 1, 'settlements', 1]] });
c('Royal Protection', 8, A, ['court'], { fxp: { peace: true } });
c('Coronation Gift', 24, E, ['court'], { fx: [['track', 'wealth', 2]] });
c('Jewelers', 10, P, ['court', 'trade'], { fx: [['gain', 'lux', 4], ['prod', 'gold', 1]] });
c('Patron of the Arts', 9, A, ['court'], { act: { pay: { lux: 3 }, fx: [['counter', 1]] }, fp: { counter: 1 } });
c('Golden Tribute', 12, E, ['court', 'trade'], { req: { wealth: [6, 99] }, fx: [['track', 'wealth', 1]] });
c('Tapestry Workshop', 13, A, ['trade', 'court'], { fxp: { on: [{ when: 'yearEnd', who: 'self', fx: [['gain', 'lux', 2]] }] } });
c('Favor of the Court', 3, E, ['court'], { fx: [['gain', 'gold', 3], ['gainPer', 'gold', 2, 'tag:court', 1]] });
c('Master of Coin', 8, A, ['court'], { fxp: { on: [{ when: 'track', track: 'wealth', who: 'self', fx: [['gain', 'gold', 3]] }] } });
c('Royal Architect', 9, A, ['court', 'building'], { fxp: { std: { city: { stone: -2, gold: -2 } } } });
c("King's Peace", 4, E, ['court'], { fx: [['protect'], ['gain', 'gold', 2]] });
c('Peasant Revolt', 6, E, [], { fx: [['harmProd', 'food', 1], ['harm', 'gold', 4]] });
c('Plague Year', 6, E, [], { fx: [['harmAll', 'food', 3]] });
c('Court Favorite', 14, P, ['court'], { req: { wealth: [8, 99] }, fx: [['rf', 1], ['gain', 'gold', 3]] });
c('Royal Banquet', 9, E, ['court', 'farming'], { fx: [['gain', 'food', -3], ['gain', 'lux', 6]] });
c('Heraldic College', 10, A, ['court', 'scholar'], { fp: { per: 'tag:court', div: 2 } });
c('Crown Jewels', 20, P, ['court'], { req: { wealth: [10, 99] }, fx: [['track', 'wealth', 1]], fp: 2 });

export const CARDS = list;
export const CARD_BY_ID = Object.fromEntries(list.map((card) => [card.id, card]));
