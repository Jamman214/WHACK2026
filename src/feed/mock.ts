import type { FeedItem } from './types';

// Placeholder summaries for offline demos, labelled "Demo summary" on every card.
// URLs point at a Guardian *search* for the topic (never a made-up article), so
// "Read the full story" always lands somewhere real. topicIds match data/taxonomy.ts.
const g = (q: string) => `https://www.theguardian.com/search?q=${encodeURIComponent(q)}`;
const d = (h: number) => new Date(Date.now() - h * 3.6e6).toISOString();
const SRC = 'Demo summary';

export const MOCK_ITEMS: FeedItem[] = [
  // --- demo bubble (cyber, minerals, sport, misinfo) ---
  { id: 'm1', topicId: 'cyber', source: SRC, publishedAt: d(2), url: g('ransomware hospitals'),
    headline: 'Ransomware gangs shift targets from banks to regional hospitals',
    summary: 'Smaller health trusts with older IT are now the easiest payday. Insurers are starting to price that risk into premiums.' },
  { id: 'm2', topicId: 'minerals', source: SRC, publishedAt: d(5), url: g('rare earth export controls'),
    headline: 'New export limits squeeze rare-earth magnets used in EVs and wind turbines',
    summary: 'A handful of processing plants control most global supply. Manufacturers are stockpiling while governments fund alternatives.' },
  { id: 'm5', topicId: 'sport', source: SRC, publishedAt: d(3), url: g('football club ownership'),
    headline: 'Sovereign wealth funds now own a quarter of top-flight European football',
    summary: 'Clubs have become instruments of national image. Regulators are debating whether ownership rules have kept up.' },
  { id: 'm7', topicId: 'misinfo', source: SRC, publishedAt: d(4), url: g('deepfake election'),
    headline: 'Deepfake audio clips spread faster than fact-checks in local elections',
    summary: 'Voice clones cost almost nothing to make. Most platforms label video, but audio slips through.' },

  // --- one bridge from the demo bubble ---
  { id: 'm9', topicId: 'ai', source: SRC, publishedAt: d(6), url: g('AI phishing emails'),
    headline: 'AI-written phishing emails are getting harder to tell from the real thing',
    summary: 'Spelling mistakes used to give scams away. Security teams are retraining staff to check the request, not the grammar.' },
  { id: 'm10', topicId: 'chips', source: SRC, publishedAt: d(8), url: g('semiconductor factories skills shortage'),
    headline: 'New chip factories are going up on three continents. Few have the engineers to run them',
    summary: 'Governments are subsidising plants to cut reliance on a few suppliers. The bottleneck is shifting from money to skilled staff.' },
  { id: 'm11', topicId: 'ev', source: SRC, publishedAt: d(10), url: g('EV battery cobalt nickel'),
    headline: 'Battery makers race to design cobalt and nickel out of EV cells',
    summary: 'Cheaper chemistries trade a little range for much less exposure to volatile metal prices and fragile supply chains.' },
  { id: 'm12', topicId: 'war', source: SRC, publishedAt: d(12), url: g('undersea cables security'),
    headline: 'Undersea cables have become a front line nobody can see',
    summary: 'Most internet traffic crosses the seabed. Navies are now watching routes that were once left to telecoms firms.' },
  { id: 'm13', topicId: 'uspol', source: SRC, publishedAt: d(7), url: g('political ads microtargeting'),
    headline: 'Campaigns are moving their budgets from TV slots to micro-targeted clips',
    summary: 'Political messaging is splintering into thousands of tailored videos, which makes it harder to see what anyone else is being told.' },
  { id: 'm14', topicId: 'health', source: SRC, publishedAt: d(9), url: g('wearables heart health'),
    headline: 'Fitness wearables are being trialled as early warnings for heart conditions',
    summary: 'Devices built for athletes are moving into clinics. Doctors are wary of false alarms filling up waiting rooms.' },
  { id: 'm15', topicId: 'techreg', source: SRC, publishedAt: d(13), url: g('online age verification privacy'),
    headline: 'Regulators want a say in how apps check a user’s age',
    summary: 'Child-safety rules are pushing platforms towards ID checks. Privacy campaigners warn that creates new troves of personal data to protect.' },
  { id: 'm16', topicId: 'culture', source: SRC, publishedAt: d(15), url: g('live music venues ticket prices'),
    headline: 'Live events are booming, but smaller acts are being priced out of venues',
    summary: 'Big tours and stadium fixtures book dates years ahead. Grassroots venues say the squeeze starts with rents and ends with closures.' },
  { id: 'm17', topicId: 'extraction', source: SRC, publishedAt: d(16), url: g('mineral processing export ban Africa'),
    headline: 'Mineral-rich countries push to refine ore at home instead of shipping it raw',
    summary: 'Export bans aim to keep more of the value chain local. Investors are weighing the risk against secure access to supply.' },
  { id: 'm18', topicId: 'markets', source: SRC, publishedAt: d(11), url: g('index funds shareholder voting'),
    headline: 'Index funds own a slice of almost every listed company. Who votes those shares?',
    summary: 'Passive investing has concentrated voting power in a few asset managers. Some now let savers choose how their stake votes.' },

  // --- two bridges away ---
  { id: 'm3', topicId: 'water', source: SRC, publishedAt: d(7), url: g('mining water drought'),
    headline: 'The lithium boom is draining aquifers in some of the driest places on earth',
    summary: 'Brine extraction uses vast amounts of water in regions already in drought. Local farmers are taking mining firms to court.' },
  { id: 'm4', topicId: 'rates', source: SRC, publishedAt: d(9), url: g('central bank interest rates'),
    headline: 'Why a rate decision in Frankfurt changes your rent in Leeds',
    summary: 'Mortgage costs track central-bank expectations, and landlords pass them on. Markets moved before the announcement was even made.' },
  { id: 'm6', topicId: 'techhubs', source: SRC, publishedAt: d(11), url: g('mobile money Africa'),
    headline: 'More people in East Africa hold a mobile wallet than a bank account',
    summary: 'Phone-based payments skipped the branch network entirely. The model is now being copied in South Asia and Latin America.' },
  { id: 'm8', topicId: 'policing', source: SRC, publishedAt: d(14), url: g('court backlog'),
    headline: 'Court backlogs mean some victims wait four years for a trial',
    summary: 'Cases collapse as witnesses drop out. Remote hearings helped during the pandemic but have since been scaled back.' },
  { id: 'm19', topicId: 'housing', source: SRC, publishedAt: d(18), url: g('first-time buyers age rent'),
    headline: 'First-time buyers keep getting older, and rent is the reason',
    summary: 'Saving a deposit while paying rent takes years longer than it did a generation ago. Some lenders now count rent history towards a mortgage.' },
];
