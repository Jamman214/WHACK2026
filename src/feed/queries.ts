// Guardian Open Platform search terms for every taxonomy topic id (see data/taxonomy.ts).
// Syntax: https://open-platform.theguardian.com/documentation/search — quotes for phrases, OR/AND.
export const QUERIES: Record<string, string> = {
  // Close to a tech bubble
  ai: '"artificial intelligence" OR "machine learning"',
  bigtech: '"big tech" OR "tech startups" OR "silicon valley"',
  cyber: 'cybersecurity OR ransomware OR "data breach" OR privacy',
  chips: 'semiconductors OR "chip makers" OR microchips',
  crypto: 'cryptocurrency OR bitcoin OR stablecoins',
  space: '"space exploration" OR NASA OR "space launch"',
  // Media & information
  misinfo: 'misinformation OR disinformation OR deepfake',
  localnews: '"local news" OR "local newspapers"',
  press: '"press freedom" OR "journalists jailed"',
  feeds: '"social media algorithm" OR "recommendation algorithm"',
  // Science & research
  physics: 'physics AND (breakthrough OR discovery)',
  biotech: 'genetics OR biotech OR "gene editing"',
  resfund: '"research funding" OR "science funding"',
  integrity: '"academic integrity" OR "research misconduct" OR plagiarism',
  // Education
  unifund: '"university funding" OR "tuition fees"',
  sdebt: '"student debt" OR "student loans"',
  schools: 'schools AND curriculum',
  aiedu: '"AI in education" OR (AI AND classroom)',
  // Work & jobs
  automation: 'automation AND jobs',
  remote: '"remote work" OR "working from home" OR "hybrid working"',
  unions: 'strike OR "trade unions" OR "industrial action"',
  gig: '"gig economy" OR "delivery riders" OR "ride-hailing drivers"',
  // Money & markets
  markets: '"stock market" OR shares OR "FTSE 100"',
  rates: '"interest rates" OR "central bank" OR "Bank of England"',
  trade: 'tariffs OR "trade war" OR "trade deal"',
  energy: '"oil price" OR "energy prices" OR OPEC',
  // Natural resources
  minerals: '"rare earths" OR "critical minerals" OR lithium',
  water: '"water scarcity" OR drought OR "water shortage"',
  mining: 'mining AND (mine OR miners)',
  ocean: 'overfishing OR fisheries OR "ocean health"',
  // Africa & emerging markets
  techhubs: '"mobile money" OR "African tech" OR (fintech AND Africa)',
  extraction: '"resource extraction" OR (minerals AND Africa)',
  imf: 'IMF OR "debt relief" OR "sovereign debt"',
  demog: '("population growth" OR demographics) AND Africa',
  // Food & agriculture
  fprice: '"food prices" OR "food inflation"',
  farm: 'farming OR "land use" OR farmers',
  altprot: '"plant-based meat" OR "lab-grown meat" OR "alternative protein"',
  fsec: '"food security" OR famine OR hunger',
  // Society & everyday life
  climate: '"climate crisis" OR "climate change"',
  housing: '"cost of living" OR "house prices" OR rents',
  health: 'health OR NHS OR medicine',
  sport: 'football OR sport OR olympics',
  culture: 'film OR music OR culture',
  // Mental health & wellbeing
  youth: '"youth mental health" OR ("young people" AND "mental health")',
  socmed: '"social media" AND (wellbeing OR "mental health")',
  lonely: 'loneliness OR isolation',
  therapy: 'therapy OR "talking therapies" OR "mental health services"',
  // Transport & cities
  ev: '"electric vehicles" OR EVs OR "electric cars"',
  rail: 'rail OR trains OR infrastructure',
  urban: '"urban planning" OR "city planning" OR cities',
  aviation: 'aviation OR airlines OR flights',
  // Politics & the world
  uspol: '"US politics" OR Congress OR "White House"',
  ukpol: '"UK politics" OR Westminster OR "prime minister"',
  china: 'China AND Taiwan',
  war: 'war OR conflict OR ceasefire',
  immig: 'immigration OR migrants OR asylum',
  // Law & justice
  scotus: '"supreme court" AND ruling',
  techreg: 'antitrust OR "tech regulation" OR "competition regulator"',
  rights: '"human rights"',
  policing: 'police OR policing OR "court backlog"',
};
