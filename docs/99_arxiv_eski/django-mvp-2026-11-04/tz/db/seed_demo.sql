-- Demo ma'lumotlar: 2 pilot profili (kichik do'kon va kafe) — faqat development/staging uchun.
-- Koordinatalar shartli; pilot hududi G1 da belgilanadi.

INSERT INTO tenants (id, name, slug, profile, package) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Demo Do''kon', 'demo-dokon', 'small_shop', 'start'),
  ('22222222-2222-2222-2222-222222222222', 'Demo Kafe', 'demo-kafe', 'restaurant', 'pro');

INSERT INTO branches (id, tenant_id, name, address, location, manual_confirm, working_hours) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Markaziy filial', 'Demo ko''chasi, 1',
   ST_GeogFromText('POINT(65.3790 40.1030)'), true,
   '{"mon":[["08:00","22:00"]],"tue":[["08:00","22:00"]],"wed":[["08:00","22:00"]],"thu":[["08:00","22:00"]],"fri":[["08:00","22:00"]],"sat":[["09:00","22:00"]],"sun":[["09:00","20:00"]]}'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
   'Kafe filiali', 'Demo ko''chasi, 15',
   ST_GeogFromText('POINT(65.3850 40.1060)'), false,
   '{"mon":[["10:00","23:00"]],"sun":[["10:00","23:00"]]}');

-- ~3 km radiusli xizmat hududi (buffer metrda)
INSERT INTO delivery_zones (tenant_id, branch_id, name, area, delivery_fee, free_from, min_order) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'Asosiy hudud',
   ST_Buffer(ST_GeogFromText('POINT(65.3790 40.1030)'), 3000), 1000000, 15000000, 5000000),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'Asosiy hudud',
   ST_Buffer(ST_GeogFromText('POINT(65.3850 40.1060)'), 3000), 1000000, NULL, 4000000);

INSERT INTO products (id, tenant_id, name, unit, is_weighted) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"uz":"Olma","ru":"Яблоки"}', 'kg', true),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '{"uz":"Non","ru":"Хлеб"}', 'pcs', false),
  ('bbbbbbbb-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '{"uz":"Osh","ru":"Плов"}', 'pcs', false);

INSERT INTO product_variants (id, tenant_id, product_id, sku, attributes) VALUES
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001', 'APPLE-KG', '{}'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000002', 'BREAD-1', '{}'),
  ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000003', 'PLOV-1', '{"portion":"1"}');

INSERT INTO branch_stock (tenant_id, branch_id, variant_id, price, available_qty) VALUES
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1800000, 50),
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000002', 400000, 1),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000003', 3500000, 40);
-- Eslatma: BREAD-1 qoldig'i 1 dona — AC-02 (parallel buyurtma) sinovi uchun ataylab.
