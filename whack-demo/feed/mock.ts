import type { FeedItem } from './types';

// Placeholder summaries for offline demos. URLs point at a Guardian search for the topic,
// so "Read the full story" always lands somewhere real. Swap topicIds to match taxonomy.ts.
const g = (q: string) => `https://www.theguardian.com/search?q=${encodeURIComponent(q)}`;
const d = (h: number) => new Date(Date.now() - h * 3.6e6).toISOString();

export const MOCK_ITEMS: FeedItem[] = [
  { id: 'm1', topicId: 'cyber', source: 'Demo summary', publishedAt: d(2), url: g('ransomware hospitals'),
    headline: 'Ransomware gangs shift targets from banks to regional hospitals',
    summary: 'Smaller health trusts with older IT are now the easiest payday. Insurers are starting to price that risk into premiums.' },
  { id: 'm2', topicId: 'minerals', source: 'Demo summary', publishedAt: d(5), url: g('rare earth export controls'),
    headline: 'New export limits squeeze rare-earth magnets used in EVs and wind turbines',
    summary: 'A handful of processing plants control most global supply. Manufacturers are stockpiling while governments fund alternatives.' },
  { id: 'm3', topicId: 'water', source: 'Demo summary', publishedAt: d(7), url: g('mining water drought'),
    headline: 'The lithium boom is draining aquifers in some of the driest places on earth',
    summary: 'Brine extraction uses vast amounts of water in regions already in drought. Local farmers are taking mining firms to court.' },
  { id: 'm4', topicId: 'central-banks', source: 'Demo summary', publishedAt: d(9), url: g('central bank interest rates'),
    headline: 'Why a rate decision in Frankfurt changes your rent in Leeds',
    summary: 'Mortgage costs track central-bank expectations, and landlords pass them on. Markets moved before the announcement was even made.' },
  { id: 'm5', topicId: 'sport', source: 'Demo summary', publishedAt: d(3), url: g('football club ownership'),
    headline: 'Sovereign wealth funds now own a quarter of top-flight European football',
    summary: 'Clubs have become instruments of national image. Regulators are debating whether ownership rules have kept up.' },
  { id: 'm6', topicId: 'mobile-money', source: 'Demo summary', publishedAt: d(11), url: g('mobile money Africa'),
    headline: 'More people in East Africa hold a mobile wallet than a bank account',
    summary: 'Phone-based payments skipped the branch network entirely. The model is now being copied in South Asia and Latin America.' },
  { id: 'm7', topicId: 'misinfo', source: 'Demo summary', publishedAt: d(4), url: g('deepfake election'),
    headline: 'Deepfake audio clips spread faster than fact-checks in local elections',
    summary: 'Voice clones cost almost nothing to make. Most platforms label video, but audio slips through.' },
  { id: 'm8', topicId: 'courts', source: 'Demo summary', publishedAt: d(14), url: g('court backlog'),
    headline: 'Court backlogs mean some victims wait four years for a trial',
    summary: 'Cases collapse as witnesses drop out. Remote hearings helped during the pandemic but have since been scaled back.' },
];
