/** Smart collections built from the entities the AI extracts from each save. */

export const COLLECTION_TYPES = ['recipe', 'place', 'product', 'event', 'workout'] as const;
export type CollectionType = typeof COLLECTION_TYPES[number];

export interface CollectionMeta {
  type: CollectionType;
  title: string;
  singular: string;
  emoji: string;
  blurb: string;
  /** Tailwind gradient classes for the tile */
  tint: string;
}

export const COLLECTIONS: Record<CollectionType, CollectionMeta> = {
  recipe: { type: 'recipe', title: 'Recipes', singular: 'recipe', emoji: '🍳', blurb: 'Dishes worth cooking', tint: 'from-orange-500/25 to-amber-400/10' },
  place: { type: 'place', title: 'Places', singular: 'place', emoji: '📍', blurb: 'Spots to visit', tint: 'from-emerald-500/25 to-teal-400/10' },
  product: { type: 'product', title: 'Wishlist', singular: 'product', emoji: '🛍️', blurb: 'Things to buy', tint: 'from-pink-500/25 to-rose-400/10' },
  event: { type: 'event', title: 'Events', singular: 'event', emoji: '📅', blurb: 'Dates to remember', tint: 'from-sky-500/25 to-indigo-400/10' },
  workout: { type: 'workout', title: 'Workouts', singular: 'workout', emoji: '💪', blurb: 'Moves to try', tint: 'from-violet-500/25 to-fuchsia-400/10' },
};

export function isCollectionType(value: string | undefined): value is CollectionType {
  return !!value && (COLLECTION_TYPES as readonly string[]).includes(value);
}

/** Google Maps search link for a place entity. */
export function mapsUrl(place: { name?: string; address?: string }): string {
  const q = [place.name, place.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Google Calendar "add event" link for an event entity (dates only when parseable). */
export function calendarUrl(event: { name?: string; startAt?: string; endAt?: string; location?: string }): string {
  const fmt = (v?: string) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };
  const start = fmt(event.startAt);
  const end = fmt(event.endAt) || start;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: event.name ?? 'Event' });
  if (start) params.set('dates', `${start}/${end}`);
  if (event.location) params.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
