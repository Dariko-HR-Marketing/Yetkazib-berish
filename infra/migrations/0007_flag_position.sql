-- 0007: kalitlar tartibi (feature_flags.json dagi joylashuv; interfeysda guruh ichidagi tartib uchun)
-- Qaytarish: alter table feature_flags drop column position;
alter table feature_flags add column position integer not null default 0;
