CREATE TABLE `life_events` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`occurred_on` text NOT NULL,
	`body` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `life_events_contact_idx` ON `life_events` (`contact_id`,`occurred_on`);