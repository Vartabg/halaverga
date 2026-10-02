// The two privacy texts (spec 1.10): the two-sentence line on the ballot and the full text on the static /privacy page. Every clause is
// checked against what the code stores (src/lib/vote/entry.ts, src/server/vote/gate.ts, netkeys.ts) and quoted word for word in
// docs/voting.md; tests/vote-docs.test.ts fails when the two drift apart.
export const PRIVACY_SHORT =
  'No sign-in, no cookies, no text box. Your vote keeps what you picked, tried and flew last, touch or desktop, the hour, a random code, and a daily network group code shared by about 4,000 networks.';

export const PRIVACY_FULL =
  'No sign-in, no cookies, no text box. We keep the way you picked (or "can\'t tell"), the ways you tried, the one you flew last, touch or desktop, and the hour you voted. ' +
  'Each vote also keeps a random code, so a resend counts once, and a network group code: a short keyed hash of your network block that changes every day and is shared by about 4,000 different blocks, ' +
  'so on its own it does not identify you or link your votes across days. Votes are kept until the poll is deleted. ' +
  'To limit repeat votes we keep keyed hashes of your network address and of your network block for about a day, and a keyed count of how many votes were sent from your network (a number, not a vote) for up to 30 days; after that they stop counting and are deleted when the store next tidies up. ' +
  'The hashes use a secret key that only we hold; whoever held it could test whether a known network voted. ' +
  'On a busy day or from a shared network a vote can be refused (the page says so and nothing is stored). ' +
  'The game page also counts visits and five steps (Begin, scene ready, a second way flown for 20 seconds, vote card shown, vote sent) with Vercel Web Analytics. ' +
  'It sets no cookie, and a count holds no pick and no vote code. Vercel records the time, page, referrer, country, region, city, browser, system and device type, and an anonymous visitor hash it discards after 24 hours. ' +
  'If your browser sends Do Not Track or Global Privacy Control, nothing is counted. ' +
  'Vercel, our host, keeps its own server logs. Your lab measurements stay on this device.';
