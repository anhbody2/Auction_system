/**
 * ui-1a.2: browse state kept in the URL (q, field, category, sort) so reload and Back restore it.
 * `category` is a category id or 'ending' for the 'Ending soon' chip.
 */
export type SearchField = 'all' | 'seller' | 'auction' | 'category' | 'product';
export type Sort = '' | 'price_asc' | 'price_desc' | 'ending';

export const FIELD_LABELS: Record<SearchField, string> = {
  all: 'Everything',
  seller: 'Seller name',
  auction: 'Auction',
  category: 'Category',
  product: 'Product',
};

/** '' keeps the server's default order (home-1.1: trending, most bids first). */
export const SORT_LABELS: Record<Sort, string> = {
  '': 'Most bids',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  ending: 'Ending soon',
};

export interface Browse {
  q: string;
  field: SearchField;
  category: string;
  sort: Sort;
}

const isField = (v: string | null): v is SearchField => !!v && v in FIELD_LABELS;
const isSort = (v: string | null): v is Sort => !!v && v in SORT_LABELS;

export function readBrowse(params: URLSearchParams): Browse {
  const category = params.get('category') ?? '';
  return {
    q: params.get('q') ?? '',
    field: isField(params.get('field')) ? (params.get('field') as SearchField) : 'all',
    category: category === 'ending' || /^\d+$/.test(category) ? category : '',
    sort: isSort(params.get('sort')) ? (params.get('sort') as Sort) : '',
  };
}

/** URL params for a browse state; defaults are left out. */
export function browseParams(b: Browse): Record<string, string> {
  const out: Record<string, string> = {};
  if (b.q) {
    out.q = b.q;
    out.field = b.field;
  }
  if (b.category) out.category = b.category;
  if (b.sort) out.sort = b.sort;
  return out;
}

/** Query string for GET /api/auctions ('' when nothing is set). */
export function browseApiQuery(b: Browse): string {
  const p = new URLSearchParams();
  if (b.q) {
    p.set('q', b.q);
    p.set('field', b.field);
  }
  if (b.category === 'ending') p.set('endingSoon', '1');
  else if (b.category) p.set('category', b.category);
  if (b.sort) p.set('sort', b.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const isFiltered = (b: Browse) => !!(b.q || b.category || b.sort);
