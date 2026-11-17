// The in-game rulebook.

import * as D from '../engine/data.js';
import { svgString } from './dom.js';

const ic = (n) => `<span class="ico">${svgString(n)}</span>`;
const cost = (c) => Object.keys(c).map((r) => `${c[r]}${ic(r)}`).join(' ');

export function rulesHtml() {
  const std = D.STD_ORDER.map((k) => `<tr><td><b>${D.STD[k].name}</b></td><td class="nowrap">${cost(D.STD[k].cost)}</td><td>${D.STD[k].text}</td></tr>`).join('');
  const trade = D.TRADE_MARKERS.map((m) => `<tr><td>${ic(m)} ${D.RES_NAME[m]}</td>${D.TRADE_TABLE[m].map((v) => `<td>${v}</td>`).join('')}</tr>`).join('');
  const tagPay = Object.keys(D.TAG_PAY).map((t) => `<li>${ic(t)} <b>${D.TAG_NAME[t]}</b> cards: each ${ic(D.TAG_PAY[t].res)} ${D.RES_NAME[D.TAG_PAY[t].res]} counts as ${D.TAG_PAY[t].value}${ic('gold')}</li>`).join('');
  return `
<h3>The aim</h3>
<p>You are a duke in a small kingdom. Impress the king and be named <b>King’s Chancellor</b>. Your standing is your
<b>Royal Favor</b> ${ic('rf')}. When the kingdom’s <b>Power</b> (10 ranks), <b>Faith</b> (15) and <b>Wealth</b> (20) have all
reached their height, the game ends after that year and the duke with the most Royal Favor plus <b>Favor Points</b> ${ic('fp')} wins.
Whoever raises a track gains 1 Royal Favor per rank. Royal Favor is also income: every year you collect Gold equal to
your Royal Favor plus your Gold production.</p>

<h3>The map</h3>
<p>Towns, cities and units stand on the <b>junctions</b> where hexes meet; roads run along the <b>edges</b>.
A town or city gains +1 production for every hex it touches:</p>
<ul class="cols">
<li>Grassland → ${ic('food')} Food</li><li>Hills → ${ic('stone')} Stone</li><li>Forest → ${ic('rm')} Raw Materials</li>
<li>Ore Mountains → ${ic('ore')} Ore</li><li>Water → ${ic('gold')} Gold</li><li>Mountains → nothing, but the settlement is <b>fortified</b></li>
</ul>
<p>Round tokens on some hexes are <b>bounties</b>: the first settlement founded beside one takes it.
No settlement may be founded on a junction next to another settlement.</p>

<h3>Setting up</h3>
<ol>
<li><b>The kingdom’s capital.</b> A site beside water and grassland is proposed. Every duke approves or vetoes it. A veto brings the next proposal; the last possible site is final.</li>
<li><b>House and opening hand.</b> Choose one of two noble houses, then keep any of 10 cards for ${D.CARD_BUY_COST}${ic('gold')} each.</li>
<li><b>Your duchy capital.</b> In reverse turn order, found your capital (a city) at least three edges from any other capital, and raise one of its productions by +2.</li>
</ol>

<h3>A year</h3>
<ol>
<li><b>Research</b> (from year 2): draw ${D.RESEARCH_DRAW} cards and buy any of them for ${D.CARD_BUY_COST}${ic('gold')} each.</li>
<li><b>Actions</b>: in turn order, take <b>one or two actions</b>, then the next duke plays. Passing takes you out for the rest of the year. The year ends when everyone has passed.</li>
<li><b>Year’s end</b>: each town turns 1 unspent ${ic('rm')} into 1 ${ic('lux')} and each city 2 (this is not optional). Then everyone collects income and production,
units regain their movement, and the Trade Track markers that nobody traded for climb one step.</li>
</ol>

<h3>Cards</h3>
<p>Cards cost Gold. <span class="chip green">Projects</span> are built once. <span class="chip blue">Standing</span> cards give a lasting
effect or an action usable once a year. <span class="chip red">Events</span> happen once and their tags do not stay in play. Tags let you pay with goods:</p>
<ul>${tagPay}</ul>

<h3>Standard improvements</h3>
<p>If you lack Stone, Ore or Food for an improvement you may pay ${D.SUBSTITUTE_COST}${ic('gold')} for each missing unit (done automatically).</p>
<table class="rules-table">${std}</table>
<p>You may also <b>sell cards</b> from your hand for 1${ic('gold')} each.</p>

<h3>Standard actions</h3>
<ul>
<li><b>Move a unit</b> along edges. Settlers and Soldiers move 2 edges a year, Caravans 3, Knights 4. <b>Edges with a road are free</b>, whoever built it. Movement may be split over several actions.</li>
<li><b>Donate a regiment</b>: remove your Soldiers or Knights at the kingdom’s capital to raise Power 1 rank (Knights also earn ${D.KNIGHT_DONATION_GOLD}${ic('gold')}).</li>
<li><b>Supply Royal Luxuries</b>: spend ${D.LUX_PER_WEALTH}${ic('lux')} to raise Wealth 1 rank.</li>
<li><b>Trade with the capital</b> (your Caravan must be there; it stays): pay ${D.TRADE_COST.rm}${ic('rm')}, ${D.TRADE_COST.ore}${ic('ore')} or ${D.TRADE_COST.gold}${ic('gold')} and collect from the Trade Track. One trade per Caravan per year.</li>
<li><b>Trade with a duke</b> (your Caravan must be at their duchy capital; it is used up): give 2 of one resource for each 1 you take of another, up to ${D.DUKE_TRADE_MAX}. They cannot refuse.</li>
<li><b>Skirmish</b> and <b>Raid</b>: see below.</li>
<li><b>Claim a Title</b> or <b>fund an Honor</b>.</li>
</ul>

<h3>The Trade Track</h3>
<p>One shared tracker with a marker for each kind of goods. Trading for a kind pays the value under its marker, then the marker
<b>drops back to its floor</b>. Each year a marker that nobody traded for <b>climbs one step</b>, so neglected goods become bargains.
Each marker can be traded for only once a year.</p>
<table class="rules-table trade"><tr><th>Step</th>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<th>${i}</th>`).join('')}</tr>${trade}</table>
<p>A <b>Trading Post</b> raises its marker’s floor by one step, and pays its owner a little (1 of that good, or 2${ic('gold')} on the Gold marker, 1${ic('gold')} on Cards) whenever anyone trades there.
Up to ${D.MAX_POSTS} posts per marker, one per duke.</p>

<h3>Units and war</h3>
<ul>
<li>Only <b>one unit may stand on a junction</b>, including one with a town or city. The <b>kingdom’s capital</b> is the exception: it is neutral ground, any number of units may gather there and nobody can be attacked there.</li>
<li>You may pass through your own units. Rivals’ units <b>block</b> you unless their duke has granted you passage (toggle it in the list of dukes).</li>
<li>Duchy capitals are walled: of a rival’s units, only Caravans may enter. Soldiers and Knights may enter a rival’s other towns and cities.</li>
<li><b>Skirmish</b>: Soldiers (strength 1) or Knights (strength 2) attack a rival unit on a neighbouring junction. A unit defending inside its own town or city gets +1.
The stronger side wins and the loser is destroyed; equal strength destroys both. You cannot attack a stronger unit.
Settlers and Caravans cannot fight: they are routed home and you plunder ${D.PLUNDER_GOLD}${ic('gold')}.</li>
<li><b>Raid</b>: Soldiers or Knights standing in a rival’s town or city carry off goods: Soldiers 2, Knights 3; one less from a city, one less from a fortified settlement.
Each item is 1 good, or 2${ic('gold')}. A settlement can be raided once a year. A unit that fights or raids is finished for the year.</li>
<li>A rival Caravan in your town does not stop you recruiting there (it is sent home); rival soldiers do.</li>
</ul>

<h3>Roads</h3>
<p>Whenever your road network links one more settlement (yours, a rival’s, or the kingdom’s capital) to another, you gain +1 ${ic('gold')} production.</p>

<h3>Titles and Honors</h3>
<p><b>Titles</b>: the first duke to meet a requirement may pay ${D.TITLE_COST}${ic('gold')} to claim it for ${D.TITLE_FP}${ic('fp')}. Only ${D.MAX_TITLES} titles are granted each game.</p>
<p><b>Honors</b>: any duke may fund an honor (${D.HONOR_COSTS.join(', then ')}${ic('gold')}; three in all). At the end, the leader in that field scores ${D.HONOR_FP[0]}${ic('fp')} and the runner-up ${D.HONOR_FP[1]}${ic('fp')} (no runner-up with two dukes).</p>

<h3>Final scoring</h3>
<p>Royal Favor + Favor Points on cards + ${D.FP_TOWN} per town + ${D.FP_CITY} per city (your capital included) + ${D.FP_CATHEDRAL} per cathedral + Titles + Honors. Ties go to the richer duke.</p>

<h3>Controls</h3>
<p>Drag to slide the map, right-drag (or two fingers) to turn it, scroll or pinch to zoom. Click one of your units to move or use it.</p>
`;
}
