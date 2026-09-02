CREATE TABLE `activity` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor` text DEFAULT 'user' NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_contact_created_idx` ON `activity` (`contact_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `activity_created_idx` ON `activity` (`created_at`);--> statement-breakpoint
CREATE INDEX `activity_entity_idx` ON `activity` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `contact_methods` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text NOT NULL,
	`type` text NOT NULL,
	`label` text,
	`value` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_methods_contact_idx` ON `contact_methods` (`contact_id`);--> statement-breakpoint
CREATE INDEX `contact_methods_value_idx` ON `contact_methods` (`value`);--> statement-breakpoint
CREATE TABLE `contact_tags` (
	`contact_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`contact_id`, `tag_id`),
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contact_tags_tag_idx` ON `contact_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`display_name` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text,
	`nickname` text,
	`birthday` text,
	`notes` text,
	`avatar_file_id` text,
	`custom_fields` text DEFAULT '{}' NOT NULL,
	`archived_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contacts_kind_idx` ON `contacts` (`kind`);--> statement-breakpoint
CREATE INDEX `contacts_display_name_idx` ON `contacts` (`display_name`);--> statement-breakpoint
CREATE INDEX `contacts_archived_at_idx` ON `contacts` (`archived_at`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`contact_id` text,
	`interaction_id` text,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`interaction_id`) REFERENCES `interactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_r2_key_unique` ON `files` (`r2_key`);--> statement-breakpoint
CREATE INDEX `files_contact_idx` ON `files` (`contact_id`);--> statement-breakpoint
CREATE INDEX `files_interaction_idx` ON `files` (`interaction_id`);--> statement-breakpoint
CREATE TABLE `interaction_contacts` (
	`interaction_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`role` text,
	PRIMARY KEY(`interaction_id`, `contact_id`),
	FOREIGN KEY (`interaction_id`) REFERENCES `interactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `interaction_contacts_contact_idx` ON `interaction_contacts` (`contact_id`,`interaction_id`);--> statement-breakpoint
CREATE TABLE `interactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`summary` text NOT NULL,
	`body` text,
	`location` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `interactions_occurred_at_idx` ON `interactions` (`occurred_at`);--> statement-breakpoint
CREATE TABLE `relationship_types` (
	`key` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`inverse_key` text NOT NULL,
	`category` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`inverse_key`) REFERENCES `relationship_types`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`from_contact_id` text NOT NULL,
	`to_contact_id` text NOT NULL,
	`type_key` text NOT NULL,
	`label` text,
	`notes` text,
	`started_at` text,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`from_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`type_key`) REFERENCES `relationship_types`(`key`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "relationships_not_self" CHECK("relationships"."from_contact_id" <> "relationships"."to_contact_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relationships_unique` ON `relationships` (`from_contact_id`,`to_contact_id`,`type_key`);--> statement-breakpoint
CREATE INDEX `relationships_from_idx` ON `relationships` (`from_contact_id`);--> statement-breakpoint
CREATE INDEX `relationships_to_idx` ON `relationships` (`to_contact_id`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_lower` text NOT NULL,
	`color` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_lower_unique` ON `tags` (`name_lower`);