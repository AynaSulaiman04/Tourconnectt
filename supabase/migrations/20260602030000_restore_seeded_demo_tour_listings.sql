insert into public.tour_listings (
  title,
  location,
  country,
  duration,
  summary,
  image_url,
  operator_name,
  featured,
  is_active
)
select
  v.title,
  v.location,
  v.country,
  v.duration,
  v.summary,
  v.image_url,
  v.operator_name,
  v.featured,
  true
from (
  values
    (
      'The Desert Pavilion',
      'Canyon Point, Utah',
      'USA',
      '4 Days',
      'Private stay with concierge support and clear arrival windows.',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1600&q=95',
      'Sahara Expeditions',
      true
    ),
    (
      'The Sandstone Sanctuary',
      'AlUla, Saudi Arabia',
      'Saudi Arabia',
      '7 Days',
      'Quiet luxury retreat with guided access and transfers.',
      'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=1600&q=95',
      'Luxe Caravan Co.',
      true
    ),
    (
      'The Nomadic Observatory',
      'Wahiba Sands, Oman',
      'Oman',
      '5 Days',
      'Stargazing-forward itinerary with flexible arrival options.',
      'https://images.unsplash.com/photo-1548013146-72479768bada?auto=format&fit=crop&w=1600&q=95',
      'Heritage Routes',
      false
    ),
    (
      'The Coastal Archive',
      'Milos, Greece',
      'Greece',
      '6 Days',
      'A coastal escape with soft pacing, private transfers, and sunset dining.',
      'https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1600&q=95',
      'Blue Horizon Travel',
      false
    )
) as v (
  title,
  location,
  country,
  duration,
  summary,
  image_url,
  operator_name,
  featured
)
where not exists (
  select 1
  from public.tour_listings as existing
  where existing.title = v.title
    and existing.location = v.location
    and existing.country = v.country
    and existing.operator_name = v.operator_name
);
