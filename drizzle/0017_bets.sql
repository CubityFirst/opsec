CREATE TABLE `bets` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`prediction` text NOT NULL,
	`wager` text,
	`made_on` text NOT NULL,
	`review_on` text NOT NULL,
	`details` text,
	`outcome` text,
	`settled_at` text,
	`settled_note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bets_contact_idx` ON `bets` (`contact_id`,`review_on`);--> statement-breakpoint
CREATE INDEX `bets_review_idx` ON `bets` (`outcome`,`review_on`);