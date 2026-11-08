// Hand-built taxonomy ported from whack-demo/reference/topic-atlas.html (CL + L).
// At runtime it is replaced by the backend's topic map (see setTaxonomy / data/api.ts loadMap);
// it stays here as the offline fixture the unit tests run against.

/** A backend group id (e.g. "g-659"); the fixture uses the hand-built ids below. */
export type CategoryId = string;

export interface Topic { id: string; name: string; category: CategoryId }
export interface Category { id: CategoryId; name: string; topics: Topic[] }
export interface Link { a: string; b: string; w: number }

const CL: [CategoryId, string, [string, string][]][] = [
  ["techbubble", "Close to a tech bubble", [["ai", "AI & machine learning"], ["bigtech", "Big Tech & startups"], ["cyber", "Cybersecurity & privacy"], ["chips", "Semiconductors"], ["crypto", "Crypto & digital money"], ["space", "Space exploration"]]],
  ["media", "Media & information", [["misinfo", "Misinformation"], ["localnews", "Decline of local news"], ["press", "Press freedom"], ["feeds", "Algorithmic feeds"]]],
  ["science", "Science & research", [["physics", "Physics breakthroughs"], ["biotech", "Genetics & biotech"], ["resfund", "Research funding"], ["integrity", "Academic integrity"]]],
  ["education", "Education", [["unifund", "University funding"], ["sdebt", "Student debt"], ["schools", "Schools & curriculum"], ["aiedu", "AI in education"]]],
  ["work", "Work & jobs", [["automation", "Automation & job losses"], ["remote", "Remote work"], ["unions", "Strikes & unions"], ["gig", "Gig economy"]]],
  ["money", "Money & markets", [["markets", "Stock markets"], ["rates", "Central banks & rates"], ["trade", "Trade & tariffs"], ["energy", "Energy & oil"]]],
  ["resources", "Natural resources", [["minerals", "Critical minerals & rare earths"], ["water", "Water scarcity"], ["mining", "Mining"], ["ocean", "Ocean & fisheries"]]],
  ["africa", "Africa & emerging markets", [["techhubs", "African tech hubs"], ["extraction", "Resource extraction"], ["imf", "Debt & the IMF"], ["demog", "Demographic growth"]]],
  ["food", "Food & agriculture", [["fprice", "Food prices"], ["farm", "Farming & land use"], ["altprot", "Alternative proteins"], ["fsec", "Food security"]]],
  ["society", "Society & everyday life", [["climate", "Climate"], ["housing", "Housing & cost of living"], ["health", "Health & medicine"], ["sport", "Sport"], ["culture", "Film, music & culture"]]],
  ["mental", "Mental health & wellbeing", [["youth", "Youth mental health"], ["socmed", "Social media effects"], ["lonely", "Loneliness"], ["therapy", "Therapy access"]]],
  ["transport", "Transport & cities", [["ev", "Electric vehicles"], ["rail", "Rail & infrastructure"], ["urban", "Urban planning"], ["aviation", "Aviation"]]],
  ["politics", "Politics & the world", [["uspol", "US politics"], ["ukpol", "UK politics"], ["china", "China–Taiwan"], ["war", "War & conflict"], ["immig", "Immigration"]]],
  ["law", "Law & justice", [["scotus", "Supreme Court rulings"], ["techreg", "Tech regulation & antitrust"], ["rights", "Human rights"], ["policing", "Policing"]]],
];

const RAW_LINKS = `ai bigtech .95|ai chips .9|ai cyber .7|ai markets .6|ai uspol .5|ai health .5|ai energy .5|ai culture .45|ai ukpol .35
bigtech markets .8|bigtech cyber .6|bigtech uspol .45|bigtech culture .4|bigtech crypto .4|bigtech space .4
chips china .9|chips trade .8|chips markets .6|chips uspol .5|cyber war .55|cyber china .5|cyber crypto .45
crypto markets .75|crypto rates .5|crypto uspol .4|space china .35|space war .35|space climate .3
markets rates .9|markets trade .65|markets energy .6|markets housing .4|markets sport .3
rates housing .85|rates ukpol .55|rates uspol .45|rates energy .4
trade china .85|trade uspol .75|trade energy .5|trade war .45|energy war .8|energy climate .85|energy housing .45
uspol china .7|uspol war .65|uspol immig .8|uspol climate .45|uspol health .4
ukpol immig .75|ukpol housing .75|ukpol health .7|ukpol war .45|ukpol climate .4
china war .55|war immig .55|war climate .2|immig housing .5
climate health .4|climate sport .25|housing health .3|health sport .5|sport culture .7|culture health .3
fprice housing .7|fprice rates .4|fprice energy .45|farm climate .6|farm trade .55|farm water .6
altprot biotech .5|altprot climate .45|fsec war .6|fsec demog .5|fsec ocean .5
unifund ukpol .65|unifund resfund .6|sdebt rates .45|sdebt housing .4|schools ukpol .4|schools youth .6|aiedu ai .8|aiedu automation .4
automation ai .9|automation uspol .45|automation ukpol .45|remote housing .55|remote bigtech .4|remote urban .5|unions ukpol .6|gig bigtech .55|gig immig .4
ev minerals .8|ev chips .55|ev china .5|ev climate .65|ev energy .6|rail ukpol .55|rail urban .6|urban housing .7|aviation climate .6|aviation energy .5
physics space .5|biotech health .75|biotech ai .5|resfund uspol .45|resfund ukpol .4|integrity ai .45|integrity misinfo .4
techhubs bigtech .55|techhubs crypto .45|techhubs ai .35|extraction mining .85|extraction minerals .6|imf rates .6|imf trade .45|imf china .45|demog immig .5
misinfo ai .65|misinfo uspol .6|misinfo war .45|localnews bigtech .4|press war .5|press rights .55|feeds bigtech .8|feeds socmed .8
scotus uspol .85|scotus immig .5|techreg bigtech .85|techreg ai .6|techreg cyber .55|techreg crypto .4|rights war .6|rights immig .55|policing ukpol .4|policing uspol .4
socmed bigtech .7|lonely culture .35|therapy health .7|therapy youth .6
minerals chips .85|minerals china .8|minerals trade .7|minerals war .4|water climate .75|water war .35|mining energy .4|ocean climate .55`;

export let CATEGORIES: Category[] = CL.map(([id, name, items]) => ({
  id,
  name,
  topics: items.map(([tid, tname]) => ({ id: tid, name: tname, category: id })),
}));
export let CATEGORY_BY_ID: Record<CategoryId, Category> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export let TOPICS: Topic[] = CATEGORIES.flatMap((c) => c.topics);
export let TOPIC_BY_ID: Record<string, Topic> = Object.fromEntries(TOPICS.map((t) => [t.id, t]));

export let LINKS: Link[] = RAW_LINKS.split(/[|\n]/).map((s) => {
  const [a, b, w] = s.trim().split(" ");
  return { a, b, w: +w };
});

/** A bubble of fixture topics, for the tests. */
export const DEMO_BUBBLE = ["cyber", "sport", "misinfo", "minerals"];

// Backend groups are dynamic, so their colours are generated: golden-angle hues stay distinct as groups grow.
let hue: Record<CategoryId, number> = {};

/** Swap in the backend's topic map (ES live bindings: every importer sees the new values). */
export function setTaxonomy(groups: { id: string; label: string }[], topics: { id: string; groupId: string; label: string }[], links: Link[]) {
  CATEGORIES = groups.map((g) => ({ id: g.id, name: g.label, topics: [] }));
  CATEGORY_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
  for (const t of topics) CATEGORY_BY_ID[t.groupId].topics.push({ id: t.id, name: t.label, category: t.groupId });
  TOPICS = CATEGORIES.flatMap((c) => c.topics);
  TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t]));
  LINKS = links.filter((l) => TOPIC_BY_ID[l.a] && TOPIC_BY_ID[l.b]);
  hue = Object.fromEntries(groups.map((g, i) => [g.id, Math.round((i * 137.508) % 360)]));
}

/** A category's colour: generated for backend groups, the styles.css custom property for the fixture. */
export const categoryColor = (c: CategoryId) => (c in hue ? `hsl(${hue[c]} 62% 52%)` : `var(--c-${c})`);
