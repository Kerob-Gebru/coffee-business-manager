CREATE TABLE `account_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`financial_account_id` int NOT NULL,
	`movement_type` enum('opening','deposit','withdrawal','transfer_in','transfer_out','payment','adjustment') NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`related_account_id` int,
	`reference_type` varchar(60),
	`reference_id` int,
	`occurred_at` datetime NOT NULL,
	`notes` text,
	CONSTRAINT `account_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int,
	`action` varchar(80) NOT NULL,
	`entity_type` varchar(80) NOT NULL,
	`entity_id` varchar(80),
	`before_data` json,
	`after_data` json,
	`reason` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contact_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(40) NOT NULL,
	`label` varchar(80) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `contact_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_types_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone` varchar(40),
	`email` varchar(190),
	`address` text,
	`notes` text,
	`roles` json NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `currencies` (
	`code` varchar(3) NOT NULL,
	`name` varchar(80) NOT NULL,
	`symbol` varchar(8),
	`is_base` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `currencies_code` PRIMARY KEY(`code`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`mime_type` varchar(120) NOT NULL,
	`storage_key` varchar(500) NOT NULL,
	`related_type` varchar(60),
	`related_id` int,
	`uploaded_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contact_id` int NOT NULL,
	`job_title` varchar(100),
	`start_date` datetime,
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exchange_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`from_currency` varchar(3) NOT NULL,
	`to_currency` varchar(3) NOT NULL,
	`rate` decimal(20,8) NOT NULL,
	`effective_date` datetime NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `exchange_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `financial_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`account_type` enum('cash','bank') NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'ETB',
	`opening_balance` decimal(18,2) NOT NULL DEFAULT '0.00',
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `financial_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inventory_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`movement_type` enum('purchase','processing_input','processing_output','sale','adjustment') NOT NULL,
	`quantity_in` decimal(18,3) NOT NULL DEFAULT '0',
	`quantity_out` decimal(18,3) NOT NULL DEFAULT '0',
	`reference_type` varchar(40),
	`reference_id` int,
	`occurred_at` datetime NOT NULL,
	`notes` text,
	CONSTRAINT `inventory_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `journal_accounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(30) NOT NULL,
	`name` varchar(140) NOT NULL,
	`account_class` enum('asset','liability','equity','income','expense') NOT NULL,
	`currency` varchar(3),
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `journal_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `journal_accounts_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entry_number` varchar(80) NOT NULL,
	`entry_date` datetime NOT NULL,
	`description` varchar(255) NOT NULL,
	`source_type` varchar(60),
	`source_id` int,
	`status` enum('draft','posted','reversed') NOT NULL DEFAULT 'draft',
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `journal_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `journal_entries_entry_number_unique` UNIQUE(`entry_number`)
);
--> statement-breakpoint
CREATE TABLE `journal_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`journal_entry_id` int NOT NULL,
	`journal_account_id` int NOT NULL,
	`debit` decimal(18,2) NOT NULL DEFAULT '0.00',
	`credit` decimal(18,2) NOT NULL DEFAULT '0.00',
	`currency` varchar(3) NOT NULL,
	`contact_id` int,
	`memo` varchar(255),
	CONSTRAINT `journal_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loan_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`loan_id` int NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`paid_at` datetime NOT NULL,
	`financial_account_id` int,
	CONSTRAINT `loan_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contact_id` int NOT NULL,
	`direction` enum('given','received') NOT NULL,
	`principal` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`interest_rate` decimal(8,4) DEFAULT '0',
	`start_date` datetime NOT NULL,
	`due_date` datetime,
	`status` enum('open','partially_paid','settled') NOT NULL DEFAULT 'open',
	`notes` text,
	CONSTRAINT `loans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `machines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`model` varchar(120),
	`serial_number` varchar(120),
	`status` enum('active','maintenance','inactive') NOT NULL DEFAULT 'active',
	`notes` text,
	CONSTRAINT `machines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`payment_id` int NOT NULL,
	`transaction_id` int NOT NULL,
	`allocated_amount` decimal(18,2) NOT NULL,
	CONSTRAINT `payment_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`public_id` varchar(64) NOT NULL,
	`contact_id` int,
	`direction` enum('received','made') NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`payment_method` enum('cash','bank_transfer') NOT NULL,
	`financial_account_id` int,
	`payment_date` datetime NOT NULL,
	`reference` varchar(120),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `payments_public_id_unique` UNIQUE(`public_id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(100) NOT NULL,
	`description` varchar(255),
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `processing_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_code` varchar(80) NOT NULL,
	`machine_id` int NOT NULL,
	`operator_contact_id` int,
	`input_product_id` int NOT NULL,
	`input_quantity` decimal(18,3) NOT NULL,
	`started_at` datetime NOT NULL,
	`completed_at` datetime,
	`waste_quantity` decimal(18,3) DEFAULT '0',
	`status` enum('planned','running','completed','cancelled') NOT NULL DEFAULT 'planned',
	`notes` text,
	CONSTRAINT `processing_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `processing_batches_batch_code_unique` UNIQUE(`batch_code`)
);
--> statement-breakpoint
CREATE TABLE `processing_outputs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batch_id` int NOT NULL,
	`product_id` int NOT NULL,
	`quantity` decimal(18,3) NOT NULL,
	CONSTRAINT `processing_outputs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`category` varchar(80),
	`unit` varchar(30) NOT NULL DEFAULT 'kg',
	`is_active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contact_id` int NOT NULL,
	`product_id` int NOT NULL,
	`quantity` decimal(18,3) NOT NULL,
	`unit_price` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`purchase_date` datetime NOT NULL,
	`notes` text,
	CONSTRAINT `purchases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role_id` int NOT NULL,
	`permission_id` int NOT NULL,
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `role_permission_unique` UNIQUE(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(60) NOT NULL,
	`description` varchar(255),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `salary_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`period_label` varchar(40),
	`paid_at` datetime,
	`status` enum('pending','paid','partial') NOT NULL DEFAULT 'pending',
	`notes` text,
	CONSTRAINT `salary_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contact_id` int NOT NULL,
	`product_id` int NOT NULL,
	`quantity` decimal(18,3) NOT NULL,
	`unit_price` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`sale_date` datetime NOT NULL,
	`notes` text,
	CONSTRAINT `sales_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_conflicts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sync_record_id` int NOT NULL,
	`local_version` json,
	`server_version` json,
	`resolution` varchar(40),
	`resolved_by` int,
	`resolved_at` datetime,
	CONSTRAINT `sync_conflicts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_record_id` varchar(100) NOT NULL,
	`entity_type` varchar(80) NOT NULL,
	`server_record_id` varchar(100),
	`status` enum('pending','confirmed','conflict') NOT NULL DEFAULT 'pending',
	`payload` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`synced_at` datetime,
	CONSTRAINT `sync_records_id` PRIMARY KEY(`id`),
	CONSTRAINT `sync_records_client_record_id_unique` UNIQUE(`client_record_id`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`public_id` varchar(64) NOT NULL,
	`title` varchar(180) NOT NULL,
	`kind` enum('income','expense','receivable','payable','loan_given','loan_received') NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'ETB',
	`exchange_rate_snapshot` decimal(20,8),
	`transaction_date` datetime NOT NULL,
	`entered_at` timestamp NOT NULL DEFAULT (now()),
	`contact_id` int,
	`notes` text,
	`sync_status` enum('confirmed','pending','conflict') NOT NULL DEFAULT 'confirmed',
	`created_by` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `transactions_public_id_unique` UNIQUE(`public_id`)
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`driver_contact_id` int,
	`origin` varchar(180),
	`destination` varchar(180),
	`trip_date` datetime NOT NULL,
	`fuel_cost` decimal(18,2),
	`currency` varchar(3) DEFAULT 'ETB',
	`notes` text,
	CONSTRAINT `trips_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`full_name` varchar(160) NOT NULL,
	`email` varchar(190) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role_id` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicle_id` int NOT NULL,
	`expense_type` varchar(80) NOT NULL,
	`amount` decimal(18,2) NOT NULL,
	`currency` varchar(3) NOT NULL,
	`expense_date` datetime NOT NULL,
	`notes` text,
	CONSTRAINT `vehicle_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`registration_number` varchar(60) NOT NULL,
	`vehicle_type` varchar(60),
	`status` enum('active','maintenance','inactive') NOT NULL DEFAULT 'active',
	`notes` text,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicles_registration_number_unique` UNIQUE(`registration_number`)
);
--> statement-breakpoint
CREATE INDEX `contacts_name_idx` ON `contacts` (`name`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `transactions_kind_idx` ON `transactions` (`kind`);