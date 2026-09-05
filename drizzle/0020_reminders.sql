CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text,
	`title` text NOT NULL,
	`notes` text,
	`due_on` text NOT NULL,
	`start_on` text NOT NULL,
	`repeat_every` integer,
	`repeat_unit` text,
	`repeat_until` text,
	`completed_at` text,
	`last_completed_on` text,
	`completed_count` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `reminders_contact_idx` ON `reminders` (`contact_id`,`due_on`);--> statement-breakpoint
CREATE INDEX `reminders_due_idx` ON `reminders` (`completed_at`,`due_on`);