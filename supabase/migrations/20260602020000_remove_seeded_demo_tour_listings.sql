delete from public.tour_listings
where (title, location, country, operator_name) in (
  ('The Desert Pavilion', 'Canyon Point, Utah', 'USA', 'Sahara Expeditions'),
  ('The Sandstone Sanctuary', 'AlUla, Saudi Arabia', 'Saudi Arabia', 'Luxe Caravan Co.'),
  ('The Nomadic Observatory', 'Wahiba Sands, Oman', 'Oman', 'Heritage Routes'),
  ('The Coastal Archive', 'Milos, Greece', 'Greece', 'Blue Horizon Travel')
);
