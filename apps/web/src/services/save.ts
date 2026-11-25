/**
 * One save path for the Save sheet, the share target and onboarding.
 * Saves online when possible, queues offline (and on network failure), and
 * surfaces real server errors instead of pretending the save worked.
 */

import type { SavedItem } from '@curio/shared';
import { ingestItem } from './api';
import { addToQueue, saveItemLocally } from './indexeddb';

export type SaveOutcome =
  | { status: 'saved'; item: SavedItem }
  | { status: 'duplicate'; item: SavedItem }
  | { status: 'queued' };

/** Pulls the first http(s) link out of pasted or shared text. */
export function findUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[),.!?\]]+$/, '') : null;
}

export function normalizeUrl(raw: string): string {
  const candidate = findUrl(raw) ?? raw.trim();
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('That doesn’t look like a link. Paste a full URL starting with https://');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only web links (http/https) can be saved.');
  }
  return url.toString();
}

export async function saveLink(raw: string, userNote?: string): Promise<SaveOutcome> {
  const url = normalizeUrl(raw);
  const note = userNote?.trim() || undefined;
  const payload = { url, ...(note ? { userNote: note } : {}) };

  const queue = async (): Promise<SaveOutcome> => {
    await addToQueue(payload);
    window.dispatchEvent(new Event('queue-updated'));
    return { status: 'queued' };
  };

  if (!navigator.onLine) return queue();

  try {
    const result = await ingestItem(payload);
    if (!result.success || !result.item) {
      throw new Error(result.error || 'The server did not confirm the save.');
    }
    await saveItemLocally(result.item);
    return { status: result.message === 'Already saved' ? 'duplicate' : 'saved', item: result.item };
  } catch (error) {
    // fetch() throws TypeError only for network failures: queue those, surface everything else
    if (error instanceof TypeError) return queue();
    throw error;
  }
}
