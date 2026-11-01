-- Misty Mountain Lifestyle Retreat's spa menu (https://www.mmh.com.au/services-3, "Spa Menu" PDF) as Treats on Barbara O'Neill's
-- Guardian site: one offer of kind 'treat' per treatment, priced in AUD as on the menu. Descriptions are written fresh and make no
-- health claims. The first line of each description is "<category> · <minutes> min" (see src/utils/treatOffers.ts).
--
-- Needs migration 20261101000000_guide_treats_and_talks.sql first. Safe to run twice: a treatment that already exists for her
-- (same title) is left alone, so a price or description edited in the admin is never overwritten. They are inserted as DRAFTS:
-- publish them from Offers > Treats and talks in the Guardian admin when you are happy with them.
insert into public.guide_offers (guide_id, kind, title, description, price_cents, currency, access_model, booking_url, status)
select p.user_id, 'treat', t.title, t.category || ' · ' || t.minutes || ' min' || E'\n' || t.body, t.price_cents, 'AUD', 'paid', 'https://www.mmh.com.au/contact', 'draft'
from public.guide_profiles p
cross join (values
  ('Facial', 'Gua Sha Facial', 60, 13000, 'A tool-assisted facial massage that supports circulation and a smoother, lifted look. Includes the face, jawline and neck.'),
  ('Facial', 'Crystal Stone Facial', 60, 14000, 'Hot and cold crystal stones with ruby balm and essential oils, to ease tension and leave skin fresh and calm.'),
  ('Facial', 'Deep Cleansing Facial', 60, 14000, 'Skin analysis, steam, deep cleansing and exfoliation, a soothing mask and a face massage, finished with hydration.'),
  ('Facial', 'Organic Coconut & Honey Facial', 60, 13000, 'A nourishing coconut and honey facial for every skin type, with a hand and arm massage.'),
  ('Facial', 'Misty Signature Facial', 60, 12000, 'Cleansing, exfoliating, steam and facial massage with a neck and shoulder massage while your mask works.'),
  ('Facial', 'Express Feet & Face Treat', 45, 9000, 'A honey and coconut foot soak with a lymphatic face massage and a foot massage. Made for tired feet.'),
  ('Facial', 'Radiant Glow Hot Stone Facial', 60, 14000, 'A nourishing facial with a hot stone face massage, a hydrating eye mask, a neck treatment and a hot stone arm and hand massage.'),
  ('Facial', 'Three Facials of Your Choice', 60, 36000, 'Choose any three facials from this menu for one price. Each is 60 minutes (the Express Feet & Face Treat is 45).'),
  ('Massage', 'Thai Massage', 60, 12000, 'A traditional floor massage of rhythmic rocking and slow stretches. Also available as a pack of three for $300.'),
  ('Massage', 'Therapeutic Massage', 60, 14000, 'A hands-on massage shaped around you, working on tension, movement and relaxation.'),
  ('Massage', 'Hot Stone Massage', 60, 13000, 'Warm volcanic stones with long, firm strokes and essential oils. A favourite in the colder months.'),
  ('Massage', 'Swedish Massage', 60, 12000, 'A full-body massage of long strokes, kneading and gentle percussion to unwind an overworked body.'),
  ('Massage', 'Remedial Massage', 60, 13000, 'A targeted massage using deep tissue release and trigger point work for tight muscles and sore spots.'),
  ('Massage', 'Lymphatic Drainage Massage', 60, 13000, 'A gentle, rhythmic massage with light movements along the lymphatic channels.'),
  ('Massage', 'Wood Therapy Massage', 60, 14000, 'Shaped wooden tools are used to sculpt and stimulate the body. Also available as a pack of three for $390.'),
  ('Massage', 'Head Massage', 30, 7000, 'A focused head, neck and scalp massage to release tension. A blend of coconut oil and rosemary can be added.'),
  ('Body', 'Body Salt Glow', 60, 14000, 'A Celtic sea salt and essential oil scrub that polishes the skin, finished with body butter.'),
  ('Body', 'Body Brush Treatment', 30, 9500, 'A dry bamboo brush technique to exfoliate and leave skin glowing. The brush is yours to take home. $65 without the brush, or $200 for a pack of three plus a brush.'),
  ('Body', 'Coffee & Chocolate Detox Scrub & Body Wrap', 60, 13500, 'A coffee spice scrub and a warm chocolate wrap, with a scalp massage while you rest, finished with body cream.'),
  ('Body', 'Organic Age-Defying Firming Body Wrap', 30, 7500, 'An organic shea butter wrap that hydrates at room temperature. Unscented or in a gentle aroma of your choice.'),
  ('Hands & feet', 'Deluxe Manicure', 60, 8500, 'Shaped nails, soft cuticles, a hand massage and a mask, finished with your favourite polish.'),
  ('Hands & feet', 'Deluxe Pedicure', 60, 11000, 'A foot bath, exfoliation and rasping, a foot and calf massage, tidy cuticles and nails, and polish.'),
  ('Therapeutic', 'Alkaline Wrap', 60, 9500, 'Hot bicarbonate-soaked towels, then woollen blankets, for a long warm rest. Five sessions for $425, which can be mixed with the oxygen chamber.'),
  ('Therapeutic', 'Hyperbaric Oxygen Chamber', 60, 9500, 'An hour of breathing pure oxygen in a pressurised chamber. Five sessions for $425, which can be mixed with the alkaline wrap.'),
  ('Therapeutic', 'Sitz Bath', 30, 7000, 'A custom hot and cold hydrotherapy bath for the lower body. Five sessions for $250, or ten for $450.'),
  ('Therapeutic', 'Ear Candling', 45, 7500, 'A beeswax ear candle treatment with a lymphatic facial drainage massage.'),
  ('Waxing & tinting', 'Beautiful Eyes Package', 45, 7000, 'Brow shaping, wax and tint, and a lash tint. Add a lip and chin wax for $95 (15 extra minutes).'),
  ('Waxing & tinting', 'Eye Lash Tint', 15, 3500, 'A lash tint for a deeper, defined look.'),
  ('Waxing & tinting', 'Eyebrow Tint', 15, 2500, 'A brow tint for a fuller, defined look.'),
  ('Waxing & tinting', 'Eye Lash & Eyebrow Tint', 30, 5000, 'A lash tint and a brow tint together.'),
  ('Waxing & tinting', 'Full Face Wax', 45, 6500, 'A full face wax.'),
  ('Waxing & tinting', 'Arm Wax', 30, 4000, 'Both arms waxed.'),
  ('Waxing & tinting', 'Underarm Wax', 10, 2500, 'Underarms waxed.'),
  ('Waxing & tinting', 'Bikini Wax', 20, 3500, 'A bikini line wax.'),
  ('Waxing & tinting', 'G-String Wax', 20, 6000, 'A G-string wax.'),
  ('Waxing & tinting', 'Brazilian Wax (Female Only)', 30, 7500, 'A Brazilian wax. Female guests only.'),
  ('Waxing & tinting', 'Half Leg Wax', 30, 3500, 'A half leg wax.'),
  ('Waxing & tinting', 'Full Leg Wax', 60, 7000, 'A full leg wax.'),
  ('Waxing & tinting', 'Back Wax', 30, 6000, 'A back wax.'),
  ('Waxing & tinting', 'Chest & Stomach Wax', 30, 6000, 'A chest and stomach wax.'),
  ('Waxing & tinting', 'Eyebrow Wax', 10, 3000, 'An eyebrow wax.'),
  ('Waxing & tinting', 'Lip or Chin Wax', 10, 2000, 'A lip or chin wax, priced for each.'),
  ('Waxing & tinting', 'Lip & Chin Wax', 30, 3500, 'A lip and chin wax together.'),
  ('Waxing & tinting', 'Full Leg & Bikini Wax', 60, 9000, 'A full leg and bikini wax together.'),
  ('Waxing & tinting', 'Half Leg & Bikini Wax', 45, 6000, 'A half leg and bikini wax together.')
) as t(category, title, minutes, price_cents, body)
where p.slug = 'barbara-oneill'
  and not exists (select 1 from public.guide_offers o where o.guide_id = p.user_id and o.kind = 'treat' and o.title = t.title);
