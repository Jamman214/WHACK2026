/**
 * The country each outlet is based in, by ISO 3166 code. Covers every outlet in data_aquisition/feeds.txt,
 * NEWSAPI_REGIONS and the current clusters.json.
 *
 * Left out on purpose (no flag is better than a misleading one):
 *  - pan-regional or multi-edition outlets: theconversation.com, allafrica.com, africanews.com, euronews.com,
 *    thelocal.com, balkaninsight.com, africa.businessinsider.com, africanarguments.org, latinamericareports.com, insightcrime.org
 *  - exile outlets, whose base and audience are different countries: meduza.io, iranwire.com, radiotamazuj.org,
 *    dabangasudan.org, irrawaddy.com, havanatimes.org, saharareporters.com
 */
const OUTLETS: Record<string, string> = {
  GB: 'bbc.co.uk bbc.com bbci.co.uk theguardian.com telegraph.co.uk independent.co.uk sky.com skynews.com ft.com inews.co.uk channel4.com newstatesman.com dailymail.co.uk dailymail.com standard.co.uk scotsman.com heraldscotland.com mirror.co.uk thesun.co.uk gbnews.com walesonline.co.uk economist.com nature.com carbonbrief.org middleeasteye.net middleeastmonitor.com newarab.com',
  US: 'foxnews.com nypost.com cbsnews.com abcnews.com abcnews.go.com nbcnews.com npr.org apnews.com axios.com fortune.com thehill.com nytimes.com politico.com theverge.com wired.com theatlantic.com dailywire.com reason.com thedailybeast.com newsweek.com pbs.org nationalgeographic.com techcrunch.com arstechnica.com washingtonpost.com nationalreview.com motherjones.com latimes.com cnbc.com propublica.org grist.org vox.com theamericanconservative.com washingtonexaminer.com cnn.com wsj.com time.com ms.now sciencedaily.com al-monitor.com restofworld.org thediplomat.com',
  CA: 'cbc.ca theglobeandmail.com globalnews.ca thestar.com',
  IE: 'irishtimes.com rte.ie thejournal.ie',
  DE: 'dw.com thelocal.de',
  FR: 'france24.com lemonde.fr thelocal.fr theafricareport.com',
  SE: 'thelocal.se',
  BE: 'politico.eu euractiv.com rapporteur.com',
  ES: 'elpais.com atalayar.com',
  IT: 'repubblica.it',
  PT: 'theportugalnews.com',
  GR: 'greekreporter.com protothema.gr',
  HU: 'hungarytoday.hu',
  NL: 'dutchnews.nl',
  EE: 'err.ee',
  PL: 'notesfrompoland.com',
  TR: 'hurriyetdailynews.com dailysabah.com bianet.org',
  IL: 'haaretz.com israelnationalnews.com ynetnews.com jpost.com timesofisrael.com israelhayom.com 972mag.com',
  QA: 'aljazeera.com dohanews.co',
  KW: 'arabtimesonline.com',
  IR: 'tehrantimes.com mehrnews.com',
  IN: 'indiatimes.com thehindu.com hindustantimes.com ndtv.com scroll.in',
  PK: 'dawn.com tribune.com.pk geo.tv',
  LK: 'economynext.com',
  SG: 'channelnewsasia.com straitstimes.com',
  MY: 'malaymail.com',
  TH: 'bangkokpost.com',
  VN: 'vnexpress.net',
  PH: 'rappler.com inquirer.net philstar.com',
  KH: 'phnompenhpost.com',
  KG: 'timesca.com',
  CN: 'cgtn.com',
  HK: 'scmp.com hongkongfp.com',
  JP: 'japantimes.co.jp japantoday.com',
  KR: 'yna.co.kr',
  AU: 'abc.net.au smh.com.au theage.com.au news.com.au crikey.com.au',
  NZ: 'stuff.co.nz nzherald.co.nz rnz.co.nz',
  PG: 'postcourier.com.pg',
  FJ: 'islandsbusiness.com',
  NG: 'punchng.com vanguardngr.com thisdaylive.com channelstv.com premiumtimesng.com',
  ZA: 'citizen.co.za dailymaverick.co.za mg.co.za iol.co.za sabcnews.com timeslive.co.za',
  GH: 'myjoyonline.com 3news.com',
  KE: 'theeastafrican.co.ke standardmedia.co.ke capitalfm.co.ke capitalfm.africa',
  UG: 'independent.co.ug',
  TZ: 'dailynews.co.tz',
  ET: 'fanamc.com fanabc.com addisfortune.news',
  ZW: 'herald.co.zw heraldonline.co.zw newsday.co.zw',
  RW: 'taarifa.rw',
  SS: 'eyeradio.org sudanspost.com',
  SD: 'sudanobserver.com',
  MW: 'nyasatimes.com',
  ZM: 'lusakatimes.com',
  MZ: 'clubofmozambique.com',
  NA: 'namibian.com.na',
  EG: 'egyptindependent.com dailynewsegypt.com egyptianstreets.com egyptian-gazette.com',
  MA: 'hespress.com northafricapost.com',
  LY: 'libyaherald.com libyareview.com libyaupdate.com',
  AR: 'batimes.com.ar buenosairesherald.com',
  BR: 'ebc.com.br riotimesonline.com',
  CO: 'colombiaone.com colombiareports.com latinamericanpost.com',
  PE: 'andina.pe',
  EC: 'ecuadortimes.net',
  VE: 'venezuelanalysis.com',
  UY: 'mercopress.com',
  CR: 'ticotimes.net qcostarica.com',
  MX: 'mexiconewsdaily.com mexicodailypost.com',
  JM: 'jamaica-gleaner.com jamaicaobserver.com',
  DO: 'dominicantoday.com',
  BB: 'barbadostoday.bb',
  GY: 'guyanachronicle.com kaieteurnewsonline.com',
  BZ: 'breakingbelizenews.com',
  KY: 'caymancompass.com',
};

const BY_DOMAIN = new Map(Object.entries(OUTLETS).flatMap(([code, domains]) => domains.split(' ').map((d) => [d, code] as const)));

/** The ISO country code of the outlet behind an article URL, or null when it has no single home country. */
export function countryOf(url: string): string | null {
  let labels: string[];
  try { labels = new URL(url).hostname.toLowerCase().split('.'); } catch { return null; }
  // Longest suffix first, so a subdomain (news.sky.com) finds its outlet (sky.com).
  for (let i = 0; i < labels.length - 1; i++) {
    const code = BY_DOMAIN.get(labels.slice(i).join('.'));
    if (code) return code;
  }
  return null;
}

const NAMES = new Intl.DisplayNames(['en'], { type: 'region', style: 'short' });

/** "UK", "Malaysia", "New Zealand"… */
export const countryName = (code: string) => NAMES.of(code) ?? code;
