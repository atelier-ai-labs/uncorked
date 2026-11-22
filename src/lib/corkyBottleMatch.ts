import { WineLog } from '../types/database';

const MAX_CARDS = 4;
const MIN_TERM_LENGTH = 4;

/**
 * Finds the cellar bottles a Corky reply mentions, by producer or wine name
 * (case-insensitive). Logs are returned in the order they first appear in the
 * reply, capped so a long answer cannot flood the chat.
 */
export function findMentionedLogs(content: string, logs: WineLog[]): WineLog[] {
  const text = content.toLowerCase();
  const hits: { log: WineLog; index: number }[] = [];

  for (const log of logs) {
    const wine = log.wines;
    if (!wine) continue;
    let first = -1;
    for (const term of [wine.name, wine.producer]) {
      const t = term?.trim().toLowerCase();
      if (!t || t.length < MIN_TERM_LENGTH) continue;
      const i = text.indexOf(t);
      if (i !== -1 && (first === -1 || i < first)) first = i;
    }
    if (first !== -1) hits.push({ log, index: first });
  }

  return hits
    .sort((a, b) => a.index - b.index)
    .slice(0, MAX_CARDS)
    .map((h) => h.log);
}
