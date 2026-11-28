import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

/** 2 columns on phones, more as the screen widens (laptops have a 256px sidebar). */
export function useMasonryColumns(): number {
  const pick = () => {
    const w = window.innerWidth;
    if (w < 768) return 2;
    if (w < 1280) return 3;
    if (w < 1536) return 4;
    return 5;
  };
  const [cols, setCols] = useState(pick);
  useEffect(() => {
    const onResize = () => setCols(pick());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return cols;
}

interface MasonryProps<T extends { id: string }> {
  items: T[];
  columns: number;
  /** Rough height/width ratio of a card before its image loads */
  estimateRatio: (item: T) => number;
  render: (item: T, index: number) => ReactNode;
  className?: string;
}

/**
 * Pinterest-style columns. Each new card goes into the column that is
 * currently shortest (measured), and keeps that column afterwards, so cards
 * never jump around as images load or more pages arrive.
 */
export function Masonry<T extends { id: string }>({ items, columns, estimateRatio, render, className }: MasonryProps<T>) {
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const assigned = useRef(new Map<string, number>());
  const lastColumns = useRef(columns);

  if (lastColumns.current !== columns) {
    assigned.current.clear();
    lastColumns.current = columns;
  }

  const buckets = useMemo(() => {
    const cols: { item: T; index: number }[][] = Array.from({ length: columns }, () => []);
    // Start from the real rendered heights, then add estimates for new cards
    const heights = Array.from({ length: columns }, (_, i) => colRefs.current[i]?.offsetHeight ?? 0);
    const colWidth = colRefs.current[0]?.offsetWidth || window.innerWidth / columns;
    const fresh = new Set<string>();

    items.forEach((item, index) => {
      let col = assigned.current.get(item.id);
      if (col === undefined || col >= columns) {
        col = heights.indexOf(Math.min(...heights));
        assigned.current.set(item.id, col);
        fresh.add(item.id);
        heights[col] += colWidth * estimateRatio(item) + 40;
      } else if (!colRefs.current[col]) {
        // First render: nothing measured yet, so estimate everything
        heights[col] += colWidth * estimateRatio(item) + 40;
      }
      cols[col].push({ item, index });
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, columns]);

  return (
    <div className={className} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 'var(--masonry-gap, 10px)', alignItems: 'start' }}>
      {buckets.map((col, i) => (
        <div key={i} ref={el => { colRefs.current[i] = el; }} className="flex min-w-0 flex-col" style={{ gap: 'var(--masonry-row-gap, 14px)' }}>
          {col.map(({ item, index }) => <div key={item.id}>{render(item, index)}</div>)}
        </div>
      ))}
    </div>
  );
}
