import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, X, SlidersHorizontal, Brain, ExternalLink } from 'lucide-react';
import { useSearch, useInfiniteSearch, useFilters } from '../hooks/useItems';
import { useSemanticSearch, useSearchSuggestions } from '../hooks/useSemanticSearch';
import { useSettings } from '../hooks/useSettings';
import { Thumbnail } from '../components/Thumbnail';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Card, CardContent } from '../components/ui/Card';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuSeparator, DropdownMenuLabel } from '../components/ui/DropdownMenu';
import { Skeleton, ItemSkeleton } from '../components/ui/Skeleton';
import { Avatar } from '../components/ui/Avatar';
import { PlatformBadge } from '../components/ui/Badge';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '../utils/cn';
import { displayAuthor, displayTitle } from '../utils/text';
import { useSuccessToast, useErrorToast } from '../components/ui/Toast';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useSettings();
  const successToast = useSuccessToast();
  const errorToast = useErrorToast();

  // State
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCluster, setSelectedCluster] = useState<string | null>(null);
  const [tagFilterQuery, setTagFilterQuery] = useState('');

  // Filters
  const { filters, toggleTag, setPlatform, setDateRange, clearFilters, hasActiveFilters } = useFilters();

  // Sync URL with state
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (filters.platform) params.set('platform', filters.platform);
    if (filters.tags.length) params.set('tags', filters.tags.join(','));
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    setSearchParams(params, { replace: true });
  }, [query, filters, setSearchParams]);

  // Fetch suggestions for autocomplete
  const { data: allItems } = useSearch({ limit: 100, semantic: false });
  const suggestions = useSearchSuggestions(allItems?.items || []);

  // Semantic search (local)
  const semantic = useSemanticSearch(allItems?.items || []);
  useEffect(() => semantic.setQuery(query), [query]);

  // Server search (when semantic not enough)
  const serverSearch = useInfiniteSearch({
    q: query,
    platform: filters.platform || undefined,
    tags: filters.tags.length ? filters.tags : undefined,
    dateFrom: filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`).toISOString() : undefined,
    dateTo: filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`).toISOString() : undefined,
    limit: settings.itemsPerPage,
    semantic: true,
  });

  const serverItems = serverSearch.data?.pages.flatMap(page => page.items) || [];
  const serverTotal = serverSearch.data?.pages[0]?.total || 0;

  // Use semantic results if available, else server
  const results = semantic.mode === 'local' && semantic.results.length > 0
    ? { items: semantic.results, total: semantic.results.length, hasMore: false, isLoading: semantic.isSearching }
    : { items: serverItems, total: serverTotal, hasMore: Boolean(serverSearch.hasNextPage), isLoading: serverSearch.isLoading };

  // Filter platforms from items
  const platforms = [...new Set(allItems?.items?.map(i => i.platform) || [])].filter(Boolean);

  // Filter tags from items
  const allTags = [...new Set(allItems?.items?.flatMap(i => i.tags) || [])].filter(Boolean).slice(0, 30);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Search</h1>
          <p className="text-muted-foreground">Find anything in your mind space</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters(!showFilters)} className={hasActiveFilters ? 'bg-primary/10 text-primary' : ''}>
            <SlidersHorizontal className="h-4 w-4 mr-1" /> Filters
            {hasActiveFilters && <Badge variant="secondary" className="ml-1">{filters.tags.length + (filters.platform ? 1 : 0) + (filters.dateFrom ? 1 : 0)}</Badge>}
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search your saves... (try: 'css grid', 'recipe', 'workout')"
          className="w-full h-12 pl-12 pr-4 text-lg rounded-xl border bg-background/50 placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
          autoFocus
          aria-label="Search"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Suggestions */}
      {query.length < 2 && (suggestions.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2">
          {(suggestions.data || []).slice(0, 8).map(s => (
            <Badge key={s} variant="outline" onClick={() => setQuery(s)} className="cursor-pointer hover:bg-accent">
              {s}
            </Badge>
          ))}
        </div>
      )}

      {/* Filters Panel */}
      {showFilters && (
        <Card className="overflow-hidden">
          <CardContent className="pt-4 pb-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Filters</h3>
              <Button variant="ghost" size="sm" onClick={clearFilters}>Clear all</Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {/* Platform Filter */}
              <div>
                <DropdownMenuLabel>Platform</DropdownMenuLabel>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {filters.platform ? filters.platform.charAt(0).toUpperCase() + filters.platform.slice(1) : 'All platforms'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={() => setPlatform('')}>All platforms</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {platforms.map(p => (
                      <DropdownMenuItem key={p} onClick={() => setPlatform(p)}>
                        <PlatformBadge platform={p} className="mr-2" />
                        {p.charAt(0).toUpperCase() + p.slice(1)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Tags Filter */}
              <div className="sm:col-span-2">
                <DropdownMenuLabel>Tags</DropdownMenuLabel>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      {filters.tags.length > 0 ? `${filters.tags.length} tags selected` : 'All tags'}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-64 max-h-80">
                    <div className="p-2">
                      <input
                        type="text"
                        placeholder="Filter tags..."
                        value={tagFilterQuery}
                        onChange={e => setTagFilterQuery(e.target.value)}
                        className="w-full mb-2 px-2 py-1.5 text-sm rounded border bg-background"
                      />
                      {allTags
                        .filter(tag => tag.toLowerCase().includes(tagFilterQuery.toLowerCase()))
                        .map(tag => (
                          <DropdownMenuCheckboxItem
                            key={tag}
                            checked={filters.tags.includes(tag)}
                            onCheckedChange={_checked => toggleTag(tag)}
                          >
                            {tag}
                          </DropdownMenuCheckboxItem>
                        ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Date Range */}
              <div>
                <DropdownMenuLabel>Date Range</DropdownMenuLabel>
                <div className="space-y-2">
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={e => setDateRange(e.target.value, filters.dateTo)}
                    placeholder="From"
                  />
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={e => setDateRange(filters.dateFrom, e.target.value)}
                    placeholder="To"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <div className="space-y-3">
        {(results.isLoading || semantic.isSearching) && results.items.length === 0 ? (
          [...Array(5)].map((_, i) => <ItemSkeleton key={i} />)
        ) : results.items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Brain className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold">No results found</h2>
            <p className="text-muted-foreground mt-1">
              {query ? `No saves matching "${query}"` : 'Your mind space is empty'}
            </p>
            {query && (
              <Button variant="outline" onClick={() => setQuery('')} className="mt-4">
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{results.total} result{results.total !== 1 ? 's' : ''}</span>
              {semantic.mode === 'local' && <Badge variant="secondary"><Brain className="h-3 w-3 mr-1" /> Local</Badge>}
            </div>
            <div className="space-y-3">
              {results.items.map(item => (
                <SearchResultItem key={item.id} item={item} />
              ))}
            </div>
            {results.hasMore && (
              <div className="text-center py-4">
                <Button variant="outline" onClick={() => serverSearch.fetchNextPage?.()}>Load more</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function SearchResultItem({ item }: { item: any }) {
  return (
    <Card className="group hover:border-primary/40 hover:shadow-sm transition-all">
      <CardContent className="p-4">
        <div className="flex gap-4">
          <Link to={`/item/${item.id}`} className="relative shrink-0 w-28 h-20 rounded-lg overflow-hidden block">
            <Thumbnail
              src={item.thumbnailUrl}
              alt={displayTitle(item)}
              className="h-full w-full"
              imgClassName="group-hover:scale-105 transition-transform duration-300"
            >
              <PlatformBadge platform={item.platform} className="absolute bottom-1 left-1" />
            </Thumbnail>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold line-clamp-1 group-hover:text-primary transition-colors">
                <Link to={`/item/${item.id}`}>{displayTitle(item)}</Link>
              </h3>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1 text-muted-foreground hover:text-foreground shrink-0"
                aria-label="Open original"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            {item.summary && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{item.summary}</p>}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {item.tags.slice(0, 5).map((tag: string) => (
                <Badge key={tag} variant="secondary" className="text-[11px] font-normal">#{tag}</Badge>
              ))}
              {item.tags.length > 5 && <Badge variant="outline" className="text-[11px]">+{item.tags.length - 5}</Badge>}
            </div>
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span className="capitalize font-medium">{displayAuthor(item) || item.platform}</span>
              <span>{formatDistanceToNow(new Date(item.savedAt), { addSuffix: true })}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
