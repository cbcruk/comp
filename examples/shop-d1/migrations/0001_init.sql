CREATE TABLE `customers` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `email` text NOT NULL
);

CREATE TABLE `orders` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `reference` text NOT NULL,
  `customer_id` integer REFERENCES `customers`(`id`),
  `status` text DEFAULT 'draft' NOT NULL,
  `placed_at` integer NOT NULL
);

CREATE TABLE `order_items` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `order_id` integer NOT NULL REFERENCES `orders`(`id`) ON DELETE cascade,
  `product` text NOT NULL,
  `quantity` integer DEFAULT 1 NOT NULL,
  `unit_price` real DEFAULT 0 NOT NULL
);

CREATE INDEX `order_items_order_id_idx` ON `order_items` (`order_id`);

CREATE TABLE `comp_history` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `collection` text NOT NULL,
  `record_id` text NOT NULL,
  `action` text NOT NULL,
  `label` text NOT NULL,
  `fields` text DEFAULT '[]' NOT NULL,
  `actor` text,
  `at` integer NOT NULL
);

CREATE INDEX `comp_history_record_idx` ON `comp_history` (`collection`,`record_id`);
CREATE INDEX `comp_history_at_idx` ON `comp_history` (`at`);
