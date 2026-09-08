-- Browse and pricing fields for tour listings.
--
-- Travellers had no way to narrow the catalogue: there was no island and no
-- structured category on `tour_listings` (the operator draft carried a free-text
-- `category` that was never published through). Pricing was equally thin -- a
-- free-text `price` with no currency and no indication of whether the figure is
-- per person or for the whole group, which forced the landing page to explain
-- the currency in a note above the grid instead of on the card itself.

alter table public.tour_listings
  add column if not exists island text,
  add column if not exists category text,
  add column if not exists price_currency text,
  add column if not exists price_basis text;

alter table public.operator_listing_drafts
  add column if not exists island text,
  add column if not exists price_currency text,
  add column if not exists price_basis text;

-- Backfill. The island is inferred from whatever free text the operator already
-- typed into location/country.
--
-- The country of both islands is "Trinidad and Tobago", so a plain '%tobago%'
-- match would classify every listing in the country as Tobago -- including ones
-- in Grande Riviere or the Arima Valley. The country name is stripped out first,
-- and a listing naming both islands is recorded as 'both'.
update public.tour_listings tl
set island = case
  when scrubbed.has_tobago and scrubbed.has_trinidad then 'both'
  when scrubbed.has_tobago then 'tobago'
  else 'trinidad'
end
from (
  select
    id,
    replace(
      replace(
        lower(coalesce(location, '') || ' ' || coalesce(country, '')),
        'trinidad and tobago', ' '
      ),
      'trinidad & tobago', ' '
    ) like '%tobago%' as has_tobago,
    replace(
      replace(
        lower(coalesce(location, '') || ' ' || coalesce(country, '')),
        'trinidad and tobago', ' '
      ),
      'trinidad & tobago', ' '
    ) like '%trinidad%' as has_trinidad
  from public.tour_listings
) as scrubbed
where scrubbed.id = tl.id
  and tl.island is null;

update public.operator_listing_drafts tl
set island = case
  when scrubbed.has_tobago and scrubbed.has_trinidad then 'both'
  when scrubbed.has_tobago then 'tobago'
  else 'trinidad'
end
from (
  select
    id,
    replace(
      replace(
        lower(coalesce(location, '') || ' ' || coalesce(country, '')),
        'trinidad and tobago', ' '
      ),
      'trinidad & tobago', ' '
    ) like '%tobago%' as has_tobago,
    replace(
      replace(
        lower(coalesce(location, '') || ' ' || coalesce(country, '')),
        'trinidad and tobago', ' '
      ),
      'trinidad & tobago', ' '
    ) like '%trinidad%' as has_trinidad
  from public.operator_listing_drafts
) as scrubbed
where scrubbed.id = tl.id
  and tl.island is null;

-- Bookings are charged in TTD through WiPay, and tour pricing is quoted per
-- person by convention. Operators can override both per listing.
update public.tour_listings
set price_currency = 'TTD'
where price_currency is null;

update public.tour_listings
set price_basis = 'per_person'
where price_basis is null;

update public.operator_listing_drafts
set price_currency = 'TTD'
where price_currency is null;

update public.operator_listing_drafts
set price_basis = 'per_person'
where price_basis is null;

-- Existing draft categories are free text and will not match the fixed
-- taxonomy, so map the ones we can and leave the rest null rather than
-- inventing a category for a listing nobody has re-categorised.
update public.operator_listing_drafts
set category = case
  when category ilike '%beach%' or category ilike '%sea%' then 'beach'
  when category ilike '%rainforest%' or category ilike '%forest%' or category ilike '%hike%' then 'rainforest'
  when category ilike '%heritage%' or category ilike '%histor%' then 'heritage'
  when category ilike '%sail%' or category ilike '%boat%' or category ilike '%catamaran%' then 'sailing'
  when category ilike '%food%' or category ilike '%culinary%' or category ilike '%rum%' then 'food-drink'
  when category ilike '%wildlife%' or category ilike '%turtle%' or category ilike '%bird%' then 'wildlife'
  when category ilike '%adventure%' or category ilike '%kayak%' or category ilike '%dive%' then 'adventure'
  when category ilike '%city%' or category ilike '%culture%' or category ilike '%carnival%' then 'city-culture'
  else null
end
where category is not null;

alter table public.tour_listings
  drop constraint if exists tour_listings_island_check;

alter table public.tour_listings
  add constraint tour_listings_island_check
  check (island is null or island in ('trinidad', 'tobago', 'both'));

alter table public.tour_listings
  drop constraint if exists tour_listings_category_check;

alter table public.tour_listings
  add constraint tour_listings_category_check
  check (
    category is null
    or category in (
      'beach',
      'rainforest',
      'heritage',
      'sailing',
      'food-drink',
      'wildlife',
      'adventure',
      'city-culture'
    )
  );

alter table public.tour_listings
  drop constraint if exists tour_listings_price_currency_check;

alter table public.tour_listings
  add constraint tour_listings_price_currency_check
  check (price_currency is null or price_currency in ('TTD', 'USD'));

alter table public.tour_listings
  drop constraint if exists tour_listings_price_basis_check;

alter table public.tour_listings
  add constraint tour_listings_price_basis_check
  check (price_basis is null or price_basis in ('per_person', 'per_group', 'total'));

-- Browse queries filter on island and category among live listings.
create index if not exists tour_listings_island_status_idx
  on public.tour_listings (island, status, created_at desc);

create index if not exists tour_listings_category_status_idx
  on public.tour_listings (category, status, created_at desc);
