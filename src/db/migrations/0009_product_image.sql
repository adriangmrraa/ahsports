-- 0009_product_image.sql — imagen de catálogo por producto (nullable).
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url text;
