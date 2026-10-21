-- ==============================================================================
-- Nasto House - Seed Data (Valid RFC 4122 Hexadecimal UUIDs for PostgreSQL)
-- ==============================================================================

-- 1. Dining Tables (Prefix: d0000000-... exactly 10 tables)
insert into public.dining_tables (id, label, is_active) values
  ('d0000001-0000-0000-0000-000000000001', 'Table 1', true),
  ('d0000002-0000-0000-0000-000000000002', 'Table 2', true),
  ('d0000003-0000-0000-0000-000000000003', 'Table 3', true),
  ('d0000004-0000-0000-0000-000000000004', 'Table 4', true),
  ('d0000005-0000-0000-0000-000000000005', 'Table 5', true),
  ('d0000006-0000-0000-0000-000000000006', 'Table 6', true),
  ('d0000007-0000-0000-0000-000000000007', 'Table 7', true),
  ('d0000008-0000-0000-0000-000000000008', 'Table 8', true),
  ('d0000009-0000-0000-0000-000000000009', 'Table 9', true),
  ('d0000010-0000-0000-0000-000000000010', 'Table 10', true)
on conflict (label) do update set is_active = true;

-- 2. Categories (Prefix: c0000000-...)
insert into public.categories (id, name, sort_order, is_active) values
  ('c0000001-0000-0000-0000-000000000001', 'Traditional Nasto & Combos', 1, true),
  ('c0000002-0000-0000-0000-000000000002', 'Steamed & Healthy Farsan', 2, true),
  ('c0000003-0000-0000-0000-000000000003', 'Crispy Bites & Kachoris', 3, true),
  ('c0000004-0000-0000-0000-000000000004', 'Hot Beverages & Refreshers', 4, true),
  ('c0000005-0000-0000-0000-000000000005', 'Sweet Treats & Jalebi', 5, true)
on conflict (id) do nothing;

-- 3. Menu Items (Prefix: b0000000-... - valid hex characters only)
insert into public.menu_items (id, category_id, name, description, price_paise, image_path, is_available, sort_order) values
  -- Traditional Nasto & Combos
  (
    'b0000001-0000-0000-0000-000000000001',
    'c0000001-0000-0000-0000-000000000001',
    'Jalebi Fafda Special Combo',
    'Crispy besan fafda (150g) paired with hot saffron jalebis (100g), spicy raw papaya sambharo & tangy besan kadhi.',
    15000,
    '/images/fafda-jalebi.jpg',
    true,
    1
  ),
  (
    'b0000002-0000-0000-0000-000000000001',
    'c0000001-0000-0000-0000-000000000001',
    'Methi Thepla Plate (4 Pcs)',
    'Fresh fenugreek flatbreads pan-roasted in pure ghee, served with sweet mango chundo, green chillies & fresh curd.',
    9000,
    '/images/thepla.jpg',
    true,
    2
  ),
  (
    'b0000003-0000-0000-0000-000000000001',
    'c0000001-0000-0000-0000-000000000001',
    'Sev Khamani Royal',
    'Crushed steamed chana dal tempered with mustard, sesame & chillies, generously topped with ratlami sev & fresh pomegranate seeds.',
    8500,
    '/images/sev-khamani.jpg',
    true,
    3
  ),

  -- Steamed & Healthy Farsan
  (
    'b0000004-0000-0000-0000-000000000002',
    'c0000002-0000-0000-0000-000000000002',
    'Nylon Khaman Spongy (Plate)',
    'Ultra-soft, melt-in-mouth steamed savoury cake tempered with mustard seeds, curry leaves, hing and green chillies.',
    6000,
    '/images/khaman.jpg',
    true,
    1
  ),
  (
    'b0000005-0000-0000-0000-000000000002',
    'c0000002-0000-0000-0000-000000000002',
    'Silky Khandvi Rolls',
    'Delicate spiced gram flour & buttermilk rolls garnished with freshly grated coconut, coriander and black mustard seeds.',
    7000,
    '/images/khandvi.jpg',
    true,
    2
  ),
  (
    'b0000006-0000-0000-0000-000000000002',
    'c0000002-0000-0000-0000-000000000002',
    'White Khatta Dhokla',
    'Fermented rice and urad dal steamed cakes dusted with crushed black pepper and roasted cumin.',
    6500,
    '/images/dhokla.jpg',
    true,
    3
  ),

  -- Crispy Bites & Kachoris
  (
    'b0000007-0000-0000-0000-000000000003',
    'c0000003-0000-0000-0000-000000000003',
    'Lilva Kachori (3 Pcs)',
    'Crisp golden flaky pastry filled with winter fresh green tuvar (pigeon peas) seasoned with ginger, clove & cinnamon.',
    7500,
    '/images/lilva-kachori.jpg',
    true,
    1
  ),
  (
    'b0000008-0000-0000-0000-000000000003',
    'c0000003-0000-0000-0000-000000000003',
    'Punjabi Samosa (2 Pcs)',
    'Flaky crust stuffed with cumin-coriander spiced potatoes, green peas and cashews, served with mint & date-tamarind chutney.',
    5000,
    '/images/samosa.jpg',
    true,
    2
  ),
  (
    'b0000009-0000-0000-0000-000000000003',
    'c0000003-0000-0000-0000-000000000003',
    'Dal Vada Plate with Fried Chillies',
    'Crunchy fried yellow moong dal fritters served smoking hot with fresh onion rings and fried salted green chillies.',
    8000,
    '/images/dal-vada.jpg',
    true,
    3
  ),

  -- Hot Beverages & Refreshers
  (
    'b0000010-0000-0000-0000-000000000004',
    'c0000004-0000-0000-0000-000000000004',
    'Adrak Elaichi Special Chai (Kullad)',
    'Simmered whole milk tea with fresh crushed ginger root, green cardamom pods and special aromatic tea masala.',
    3000,
    '/images/chai.jpg',
    true,
    1
  ),
  (
    'b0000011-0000-0000-0000-000000000004',
    'c0000004-0000-0000-0000-000000000004',
    'Masala Chaas (Spiced Buttermilk)',
    'Refreshing churned yoghurt drink infused with roasted cumin powder, black salt, fresh mint, and coriander.',
    2500,
    '/images/chaas.jpg',
    true,
    2
  ),
  (
    'b0000012-0000-0000-0000-000000000004',
    'c0000004-0000-0000-0000-000000000004',
    'Madras Filter Coffee',
    'Rich, frothy decoction brewed with dark roasted chicory coffee beans and steaming hot frothed milk.',
    4000,
    '/images/coffee.jpg',
    true,
    3
  ),

  -- Sweet Treats & Jalebi
  (
    'b0000013-0000-0000-0000-000000000005',
    'c0000005-0000-0000-0000-000000000005',
    'Pure Ghee Kesari Jalebi (100g)',
    'Freshly fried spiral jalebis soaked in saffron sugar syrup with cardamom and pistachio slivers.',
    7000,
    '/images/jalebi.jpg',
    true,
    1
  ),
  (
    'b0000014-0000-0000-0000-000000000005',
    'c0000005-0000-0000-0000-000000000005',
    'Traditional Mohanthal (100g)',
    'Royal Gujarati sweet made from coarse besan roasted in pure cow ghee, flavored with saffron, mace and slivered almonds.',
    9500,
    '/images/mohanthal.jpg',
    true,
    2
  )
on conflict (id) do nothing;

-- 4. Shop Settings (Prefix: f0000000-...)
insert into public.shop_settings (id, shop_name, currency, tax_enabled, tax_rate_basis_points)
values ('f0000001-0000-0000-0000-000000000001', 'Nasto House Authentic Farsan & Sweets', 'INR', true, 500)
on conflict (id) do nothing;
