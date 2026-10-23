// Content loading. M1: the index only; phase chunks and the private pack arrive in M2/M4.
import { contentIndexUrl } from 'virtual:mq-content';
import type { ContentIndex } from '../core/types';

/** Loads the content index. The service worker precaches it, so this works offline. */
export async function loadContentIndex(): Promise<ContentIndex> {
  const res = await fetch(contentIndexUrl);
  if (!res.ok) throw new Error(`Content index request failed: ${res.status}`);
  return (await res.json()) as ContentIndex;
}
