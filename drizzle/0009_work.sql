ALTER TABLE `contacts` ADD `job_title` text;--> statement-breakpoint
ALTER TABLE `contacts` ADD `employer_contact_id` text REFERENCES contacts(id) ON DELETE SET NULL;