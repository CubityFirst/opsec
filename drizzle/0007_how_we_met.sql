ALTER TABLE `contacts` ADD `met_on` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `met_where` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `met_how` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `met_via_contact_id` text REFERENCES contacts(id) ON DELETE SET NULL;