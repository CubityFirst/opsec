CREATE TABLE `gifts` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`occasion` text,
	`given_on` text,
	`price` text,
	`url` text,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gifts_contact_idx` ON `gifts` (`contact_id`,`status`,`given_on`);--> statement-breakpoint
CREATE INDEX `gifts_status_idx` ON `gifts` (`status`,`given_on`);