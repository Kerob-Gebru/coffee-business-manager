CREATE TABLE `coffee_trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`lot_number` varchar(80) NOT NULL,
	`grade` varchar(60) NOT NULL,
	`weight_kg` decimal(14,3) NOT NULL,
	`moisture_pct` decimal(5,2) NOT NULL,
	`contact_id` int NOT NULL,
	`trade_type` enum('purchase','sale') NOT NULL,
	`trade_date` datetime NOT NULL,
	`notes` text,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `coffee_trades_id` PRIMARY KEY(`id`),
	CONSTRAINT `coffee_trades_company_lot_unique` UNIQUE(`company_id`,`lot_number`),
	CONSTRAINT `coffee_trades_values_valid` CHECK(weight_kg > 0 AND moisture_pct >= 0 AND moisture_pct <= 100)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(180) NOT NULL,
	`status` enum('active','suspended') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
INSERT INTO `companies` (`id`, `name`, `status`) VALUES (1, 'Legacy Workspace', 'active');--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`item_name` varchar(160) NOT NULL,
	`warehouse_location` varchar(160) NOT NULL,
	`bag_count` int NOT NULL DEFAULT 0,
	`total_weight_kg` decimal(14,3) NOT NULL DEFAULT '0.000',
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `inventory_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `inventory_items_company_id_id_unique` UNIQUE(`company_id`,`id`),
	CONSTRAINT `inventory_items_nonnegative` CHECK(bag_count >= 0 AND total_weight_kg >= 0)
);
--> statement-breakpoint
CREATE TABLE `invoice_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`invoice_id` int NOT NULL,
	`transaction_id` int NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`paid_at` datetime NOT NULL,
	`notes` text,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoice_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoice_payments_company_transaction_unique` UNIQUE(`company_id`,`transaction_id`),
	CONSTRAINT `invoice_payments_amount_positive` CHECK(amount > 0)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`invoice_number` varchar(60) NOT NULL,
	`party_type` enum('customer','supplier') NOT NULL,
	`contact_id` int NOT NULL,
	`issue_date` datetime NOT NULL,
	`due_date` datetime NOT NULL,
	`status` enum('draft','sent','partially_paid','paid','cancelled') NOT NULL DEFAULT 'draft',
	`currency` varchar(3) NOT NULL DEFAULT 'ETB',
	`subtotal` decimal(18,2) NOT NULL DEFAULT '0.00',
	`tax_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
	`total_amount` decimal(18,2) NOT NULL DEFAULT '0.00',
	`amount_paid` decimal(18,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_company_number_unique` UNIQUE(`company_id`,`invoice_number`),
	CONSTRAINT `invoices_company_id_id_unique` UNIQUE(`company_id`,`id`),
	CONSTRAINT `invoices_amounts_valid` CHECK(subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND total_amount = subtotal + tax_amount AND amount_paid >= 0 AND amount_paid <= total_amount)
);
--> statement-breakpoint
CREATE TABLE `password_reset_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime NOT NULL,
	`used_at` datetime,
	`request_ip` varchar(45),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_reset_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `password_reset_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`inventory_item_id` int NOT NULL,
	`direction` enum('in','out') NOT NULL,
	`bag_quantity` int NOT NULL DEFAULT 0,
	`weight_kg` decimal(14,3) NOT NULL,
	`movement_date` datetime NOT NULL,
	`reference` varchar(255),
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_movements_values_valid` CHECK(bag_quantity >= 0 AND weight_kg > 0)
);
--> statement-breakpoint
CREATE TABLE `vehicle_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`vehicle_id` int NOT NULL,
	`log_type` enum('maintenance','fuel') NOT NULL,
	`description` varchar(255) NOT NULL,
	`mileage_km` decimal(12,1) NOT NULL,
	`log_date` datetime NOT NULL,
	`cost` decimal(18,2),
	`currency` varchar(3) NOT NULL DEFAULT 'ETB',
	`notes` text,
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vehicle_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicle_logs_values_valid` CHECK(mileage_km >= 0 AND (cost IS NULL OR cost >= 0))
);
--> statement-breakpoint
ALTER TABLE `journal_accounts` DROP INDEX `journal_accounts_code_unique`;--> statement-breakpoint
ALTER TABLE `journal_entries` DROP INDEX `journal_entries_entry_number_unique`;--> statement-breakpoint
ALTER TABLE `processing_batches` DROP INDEX `processing_batches_batch_code_unique`;--> statement-breakpoint
ALTER TABLE `sync_records` DROP INDEX `sync_records_client_record_id_unique`;--> statement-breakpoint
ALTER TABLE `vehicles` DROP INDEX `vehicles_registration_number_unique`;--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `contact_id` int;--> statement-breakpoint
ALTER TABLE `processing_batches` MODIFY COLUMN `machine_id` int;--> statement-breakpoint
ALTER TABLE `processing_batches` MODIFY COLUMN `input_product_id` int;--> statement-breakpoint
ALTER TABLE `account_movements` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `contacts` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `documents` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `employees` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `employees` ADD `full_name` varchar(160);--> statement-breakpoint
UPDATE `employees` e
JOIN `contacts` c ON c.`id` = e.`contact_id`
SET e.`full_name` = c.`name`
WHERE e.`full_name` IS NULL;--> statement-breakpoint
UPDATE `employees` SET `full_name` = CONCAT('Employee #', `id`) WHERE `full_name` IS NULL;--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `full_name` varchar(160) NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `phone` varchar(40);--> statement-breakpoint
ALTER TABLE `employees` ADD `created_by` int;--> statement-breakpoint
ALTER TABLE `employees` ADD `created_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `financial_accounts` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `journal_accounts` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `journal_lines` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `loan_payments` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `loans` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `machines` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `payment_allocations` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `payments` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `processing_batches` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `processing_batches` ADD `output_quantity` decimal(18,3);--> statement-breakpoint
ALTER TABLE `processing_batches` ADD `processing_method` enum('washed','natural','other');--> statement-breakpoint
ALTER TABLE `processing_batches` ADD `created_by` int;--> statement-breakpoint
ALTER TABLE `processing_batches` ADD `created_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `processing_batches` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `processing_outputs` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `products` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `purchases` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `salary_records` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `sales` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `sync_conflicts` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `sync_records` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `transactions` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `transactions` ADD `category` varchar(80);--> statement-breakpoint
ALTER TABLE `transactions` ADD `payment_method` enum('cash','bank_transfer','other');--> statement-breakpoint
ALTER TABLE `transactions` ADD `reference` varchar(120);--> statement-breakpoint
ALTER TABLE `transactions` ADD `coffee_trade_id` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `processing_batch_id` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `inventory_item_id` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `vehicle_log_id` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `employee_id` int;--> statement-breakpoint
ALTER TABLE `trips` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `users` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `password_changed_at` datetime;--> statement-breakpoint
ALTER TABLE `users` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `vehicle_expenses` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `company_id` int NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `driver_contact_id` int;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `current_mileage` decimal(12,1) DEFAULT '0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `created_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` ADD `updated_at` timestamp DEFAULT (now()) NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `account_movements` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `audit_logs` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `documents` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `employees` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `financial_accounts` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `inventory_movements` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `journal_accounts` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `journal_entries` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `journal_lines` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `loan_payments` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `loans` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `machines` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_allocations` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `payments` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `processing_batches` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `processing_outputs` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `products` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `purchases` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `salary_records` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_conflicts` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_records` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `trips` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicle_expenses` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `vehicles` MODIFY COLUMN `company_id` int NOT NULL;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_company_id_id_unique` UNIQUE(`company_id`,`id`);--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_company_id_id_unique` UNIQUE(`company_id`,`id`);--> statement-breakpoint
ALTER TABLE `journal_accounts` ADD CONSTRAINT `journal_accounts_company_code_unique` UNIQUE(`company_id`,`code`);--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_company_number_unique` UNIQUE(`company_id`,`entry_number`);--> statement-breakpoint
ALTER TABLE `processing_batches` ADD CONSTRAINT `processing_batches_company_batch_code_unique` UNIQUE(`company_id`,`batch_code`);--> statement-breakpoint
ALTER TABLE `sync_records` ADD CONSTRAINT `sync_records_company_client_unique` UNIQUE(`company_id`,`client_record_id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_company_id_id_unique` UNIQUE(`company_id`,`id`);--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_company_registration_unique` UNIQUE(`company_id`,`registration_number`);--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_company_id_id_unique` UNIQUE(`company_id`,`id`);--> statement-breakpoint
ALTER TABLE `coffee_trades` ADD CONSTRAINT `coffee_trades_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coffee_trades` ADD CONSTRAINT `coffee_trades_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `coffee_trades` ADD CONSTRAINT `coffee_trades_company_contact_fk` FOREIGN KEY (`company_id`,`contact_id`) REFERENCES `contacts`(`company_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_items` ADD CONSTRAINT `inventory_items_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_payments` ADD CONSTRAINT `invoice_payments_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_payments` ADD CONSTRAINT `invoice_payments_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_payments` ADD CONSTRAINT `invoice_payments_company_invoice_fk` FOREIGN KEY (`company_id`,`invoice_id`) REFERENCES `invoices`(`company_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoice_payments` ADD CONSTRAINT `invoice_payments_company_transaction_fk` FOREIGN KEY (`company_id`,`transaction_id`) REFERENCES `transactions`(`company_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_company_contact_fk` FOREIGN KEY (`company_id`,`contact_id`) REFERENCES `contacts`(`company_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_company_item_fk` FOREIGN KEY (`company_id`,`inventory_item_id`) REFERENCES `inventory_items`(`company_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicle_logs` ADD CONSTRAINT `vehicle_logs_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicle_logs` ADD CONSTRAINT `vehicle_logs_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicle_logs` ADD CONSTRAINT `vehicle_logs_company_vehicle_fk` FOREIGN KEY (`company_id`,`vehicle_id`) REFERENCES `vehicles`(`company_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `coffee_trades_company_id_idx` ON `coffee_trades` (`company_id`);--> statement-breakpoint
CREATE INDEX `coffee_trades_company_date_idx` ON `coffee_trades` (`company_id`,`trade_date`);--> statement-breakpoint
CREATE INDEX `coffee_trades_company_grade_idx` ON `coffee_trades` (`company_id`,`grade`);--> statement-breakpoint
CREATE INDEX `inventory_items_company_id_idx` ON `inventory_items` (`company_id`);--> statement-breakpoint
CREATE INDEX `inventory_items_company_warehouse_idx` ON `inventory_items` (`company_id`,`warehouse_location`);--> statement-breakpoint
CREATE INDEX `inventory_items_company_name_idx` ON `inventory_items` (`company_id`,`item_name`);--> statement-breakpoint
CREATE INDEX `invoice_payments_company_id_idx` ON `invoice_payments` (`company_id`);--> statement-breakpoint
CREATE INDEX `invoice_payments_company_invoice_idx` ON `invoice_payments` (`company_id`,`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoices_company_id_idx` ON `invoices` (`company_id`);--> statement-breakpoint
CREATE INDEX `invoices_company_status_due_idx` ON `invoices` (`company_id`,`status`,`due_date`);--> statement-breakpoint
CREATE INDEX `invoices_company_contact_idx` ON `invoices` (`company_id`,`contact_id`);--> statement-breakpoint
CREATE INDEX `password_reset_tokens_user_expiry_idx` ON `password_reset_tokens` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE INDEX `stock_movements_company_id_idx` ON `stock_movements` (`company_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_company_item_date_idx` ON `stock_movements` (`company_id`,`inventory_item_id`,`movement_date`);--> statement-breakpoint
CREATE INDEX `vehicle_logs_company_id_idx` ON `vehicle_logs` (`company_id`);--> statement-breakpoint
CREATE INDEX `vehicle_logs_company_vehicle_date_idx` ON `vehicle_logs` (`company_id`,`vehicle_id`,`log_date`);--> statement-breakpoint
ALTER TABLE `processing_batches` ADD CONSTRAINT `processing_batches_quantities_valid` CHECK (input_quantity > 0 AND (output_quantity IS NULL OR (output_quantity >= 0 AND output_quantity <= input_quantity)));--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_mileage_nonnegative` CHECK (current_mileage >= 0);--> statement-breakpoint
ALTER TABLE `account_movements` ADD CONSTRAINT `account_movements_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `contacts` ADD CONSTRAINT `contacts_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_company_contact_fk` FOREIGN KEY (`company_id`,`contact_id`) REFERENCES `contacts`(`company_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `financial_accounts` ADD CONSTRAINT `financial_accounts_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `inventory_movements` ADD CONSTRAINT `inventory_movements_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journal_accounts` ADD CONSTRAINT `journal_accounts_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journal_entries` ADD CONSTRAINT `journal_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `journal_lines` ADD CONSTRAINT `journal_lines_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loan_payments` ADD CONSTRAINT `loan_payments_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `loans` ADD CONSTRAINT `loans_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `machines` ADD CONSTRAINT `machines_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_allocations` ADD CONSTRAINT `payment_allocations_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payments` ADD CONSTRAINT `payments_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `processing_batches` ADD CONSTRAINT `processing_batches_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `processing_batches` ADD CONSTRAINT `processing_batches_machine_id_machines_id_fk` FOREIGN KEY (`machine_id`) REFERENCES `machines`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `processing_batches` ADD CONSTRAINT `processing_batches_input_product_id_products_id_fk` FOREIGN KEY (`input_product_id`) REFERENCES `products`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `processing_batches` ADD CONSTRAINT `processing_batches_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `processing_outputs` ADD CONSTRAINT `processing_outputs_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `processing_outputs` ADD CONSTRAINT `processing_outputs_batch_id_processing_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `processing_batches`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `processing_outputs` ADD CONSTRAINT `processing_outputs_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_records` ADD CONSTRAINT `salary_records_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_records` ADD CONSTRAINT `salary_records_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_conflicts` ADD CONSTRAINT `sync_conflicts_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_records` ADD CONSTRAINT `sync_records_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_coffee_trade_id_coffee_trades_id_fk` FOREIGN KEY (`coffee_trade_id`) REFERENCES `coffee_trades`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_processing_batch_id_processing_batches_id_fk` FOREIGN KEY (`processing_batch_id`) REFERENCES `processing_batches`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_inventory_item_id_inventory_items_id_fk` FOREIGN KEY (`inventory_item_id`) REFERENCES `inventory_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_vehicle_log_id_vehicle_logs_id_fk` FOREIGN KEY (`vehicle_log_id`) REFERENCES `vehicle_logs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `trips` ADD CONSTRAINT `trips_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicle_expenses` ADD CONSTRAINT `vehicle_expenses_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_company_driver_fk` FOREIGN KEY (`company_id`,`driver_contact_id`) REFERENCES `contacts`(`company_id`,`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_movements_company_id_idx` ON `account_movements` (`company_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_company_id_idx` ON `audit_logs` (`company_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_company_created_idx` ON `audit_logs` (`company_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `contacts_company_id_idx` ON `contacts` (`company_id`);--> statement-breakpoint
CREATE INDEX `contacts_company_name_idx` ON `contacts` (`company_id`,`name`);--> statement-breakpoint
CREATE INDEX `documents_company_id_idx` ON `documents` (`company_id`);--> statement-breakpoint
CREATE INDEX `employees_company_id_idx` ON `employees` (`company_id`);--> statement-breakpoint
CREATE INDEX `employees_company_active_idx` ON `employees` (`company_id`,`is_active`);--> statement-breakpoint
CREATE INDEX `employees_company_name_idx` ON `employees` (`company_id`,`full_name`);--> statement-breakpoint
CREATE INDEX `financial_accounts_company_id_idx` ON `financial_accounts` (`company_id`);--> statement-breakpoint
CREATE INDEX `inventory_movements_company_id_idx` ON `inventory_movements` (`company_id`);--> statement-breakpoint
CREATE INDEX `journal_accounts_company_id_idx` ON `journal_accounts` (`company_id`);--> statement-breakpoint
CREATE INDEX `journal_entries_company_id_idx` ON `journal_entries` (`company_id`);--> statement-breakpoint
CREATE INDEX `journal_lines_company_id_idx` ON `journal_lines` (`company_id`);--> statement-breakpoint
CREATE INDEX `loan_payments_company_id_idx` ON `loan_payments` (`company_id`);--> statement-breakpoint
CREATE INDEX `loans_company_id_idx` ON `loans` (`company_id`);--> statement-breakpoint
CREATE INDEX `machines_company_id_idx` ON `machines` (`company_id`);--> statement-breakpoint
CREATE INDEX `payment_allocations_company_id_idx` ON `payment_allocations` (`company_id`);--> statement-breakpoint
CREATE INDEX `payments_company_id_idx` ON `payments` (`company_id`);--> statement-breakpoint
CREATE INDEX `processing_batches_company_id_idx` ON `processing_batches` (`company_id`);--> statement-breakpoint
CREATE INDEX `processing_batches_company_started_idx` ON `processing_batches` (`company_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `processing_outputs_company_id_idx` ON `processing_outputs` (`company_id`);--> statement-breakpoint
CREATE INDEX `products_company_id_idx` ON `products` (`company_id`);--> statement-breakpoint
CREATE INDEX `purchases_company_id_idx` ON `purchases` (`company_id`);--> statement-breakpoint
CREATE INDEX `salary_records_company_id_idx` ON `salary_records` (`company_id`);--> statement-breakpoint
CREATE INDEX `sales_company_id_idx` ON `sales` (`company_id`);--> statement-breakpoint
CREATE INDEX `sync_conflicts_company_id_idx` ON `sync_conflicts` (`company_id`);--> statement-breakpoint
CREATE INDEX `sync_records_company_id_idx` ON `sync_records` (`company_id`);--> statement-breakpoint
CREATE INDEX `transactions_company_id_idx` ON `transactions` (`company_id`);--> statement-breakpoint
CREATE INDEX `transactions_company_date_idx` ON `transactions` (`company_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_company_kind_idx` ON `transactions` (`company_id`,`kind`);--> statement-breakpoint
CREATE INDEX `trips_company_id_idx` ON `trips` (`company_id`);--> statement-breakpoint
CREATE INDEX `users_company_id_idx` ON `users` (`company_id`);--> statement-breakpoint
CREATE INDEX `vehicle_expenses_company_id_idx` ON `vehicle_expenses` (`company_id`);--> statement-breakpoint
CREATE INDEX `vehicles_company_id_idx` ON `vehicles` (`company_id`);--> statement-breakpoint
CREATE INDEX `vehicles_company_status_idx` ON `vehicles` (`company_id`,`status`);