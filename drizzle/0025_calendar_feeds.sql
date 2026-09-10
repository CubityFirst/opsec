CREATE TABLE `calendar_feeds` (
	`id` text PRIMARY KEY NOT NULL,
	`sub` text NOT NULL,
	`name` text NOT NULL,
	`sources` text NOT NULL,
	`key` text NOT NULL,
	`last_fetched_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_feeds_key_unique` ON `calendar_feeds` (`key`);--> statement-breakpoint
CREATE INDEX `calendar_feeds_sub_idx` ON `calendar_feeds` (`sub`);