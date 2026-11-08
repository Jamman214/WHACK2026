import { CATEGORY_BY_ID, type CategoryId } from "./taxonomy";

/** Plain-language copy for each category "planet" in the Atlas solar system. */
export interface PlanetInfo {
  /** One short line, at most 8 words. */
  tagline: string;
  /** 2–3 neutral sentences on what this area covers and why it matters. */
  blurb: string;
}

export const PLANET_INFO: Record<CategoryId, PlanetInfo> = {
  techbubble: {
    tagline: "The technology shaping what comes next",
    blurb:
      "This area covers artificial intelligence, big technology companies, online security, computer chips, digital money and space travel. These tools and firms influence how we work, talk and spend. Following them helps you understand who holds power in a digital world.",
  },
  media: {
    tagline: "How news and information reach you",
    blurb:
      "Here you will find stories about false information, the state of local news, press freedom and the feeds that decide what you see. The way information travels shapes what people believe and talk about. Knowing how it works makes it easier to spot what is missing.",
  },
  science: {
    tagline: "How we find out how the world works",
    blurb:
      "This covers big discoveries in physics and biology, how research gets paid for, and how scientists keep their work honest. Science drives new medicines, technology and ideas. It matters because many public choices depend on trustworthy evidence.",
  },
  education: {
    tagline: "How people learn, and who pays for it",
    blurb:
      "Stories here look at schools, universities, student debt and the growing use of AI in classrooms. Education affects the opportunities people have later in life. Decisions about it reach almost every family sooner or later.",
  },
  work: {
    tagline: "Jobs, pay and the changing workplace",
    blurb:
      "This area covers automation, working from home, strikes and unions, and app-based gig work. It is about how people earn a living and how that is changing. These shifts touch almost everyone who has, or will want, a job.",
  },
  money: {
    tagline: "How money, markets and prices move",
    blurb:
      "Here you will find stock markets, interest rates, trade between countries and the cost of energy. These forces affect prices in shops, the cost of borrowing and the value of savings. They often explain why everyday life gets cheaper or dearer.",
  },
  resources: {
    tagline: "The materials and water we all depend on",
    blurb:
      "This covers metals and minerals, mining, water supplies and the health of the oceans. Almost everything we use, from phones to food, starts with natural resources. Who controls them, and how they are used, matters for the whole planet.",
  },
  africa: {
    tagline: "Fast-changing economies beyond the usual headlines",
    blurb:
      "This area looks at technology hubs, mining and trade, national debt and fast-growing populations across Africa and other emerging economies. These regions are home to a large share of the world's young people. What happens there increasingly affects everyone else.",
  },
  food: {
    tagline: "How food is grown, priced and shared",
    blurb:
      "Stories here cover food prices, farming, new kinds of protein and whether people have enough to eat. Food is a basic need that links weather, trade and household budgets. Changes in the food system can be felt at every dinner table.",
  },
  society: {
    tagline: "The big issues in everyday life",
    blurb:
      "This area covers climate, housing and the cost of living, health, sport, and film, music and culture. These are the topics people talk about with friends and family. They shape how we live, what we enjoy and what we worry about.",
  },
  mental: {
    tagline: "How we are really doing, inside",
    blurb:
      "Here you will find stories on young people's mental health, the effects of social media, loneliness and access to therapy. Wellbeing affects school, work and relationships. Understanding it can help people support themselves and others.",
  },
  transport: {
    tagline: "How people and goods get around",
    blurb:
      "This covers electric vehicles, railways, the design of cities and air travel. How we move shapes the air we breathe, how long journeys take and where people can afford to live. Choices made about transport tend to last for decades.",
  },
  politics: {
    tagline: "Power, elections and relations between countries",
    blurb:
      "This area covers politics in the US and the UK, relations between China and Taiwan, war and conflict, and immigration. Decisions made by governments affect taxes, safety and who can live where. Following them helps you see how choices are made on your behalf.",
  },
  law: {
    tagline: "Rules, rights and how they are enforced",
    blurb:
      "Stories here cover major court rulings, rules for technology companies, human rights and policing. Laws set the limits for governments, businesses and individuals. They matter because they decide what is fair, and who gets to decide.",
  },
};

/** Backend groups have no hand-written copy yet: fall back to a tagline built from their first topics. */
export const planetInfo = (id: CategoryId): PlanetInfo =>
  PLANET_INFO[id] ?? { tagline: (CATEGORY_BY_ID[id]?.topics ?? []).slice(0, 3).map((t) => t.name).join(", "), blurb: "" };
