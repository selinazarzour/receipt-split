CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`invite_token` text NOT NULL,
	`receipt_date` text NOT NULL,
	`paid_total` integer NOT NULL,
	`people_json` text NOT NULL,
	`items_json` text NOT NULL,
	`filename` text,
	`content_type` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipts_invite_token_unique` ON `receipts` (`invite_token`);--> statement-breakpoint
CREATE INDEX `idx_receipts_owner_date` ON `receipts` (`owner_id`,`receipt_date`);