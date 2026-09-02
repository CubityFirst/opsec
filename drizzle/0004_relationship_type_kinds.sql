ALTER TABLE `relationship_types` ADD `from_kinds` text DEFAULT 'person,pet,organization' NOT NULL;--> statement-breakpoint
ALTER TABLE `relationship_types` ADD `to_kinds` text DEFAULT 'person,pet,organization' NOT NULL;--> statement-breakpoint
-- "from is the <type> of to": which kinds may sit on each end.
UPDATE `relationship_types` SET `from_kinds` = 'person', `to_kinds` = 'person' WHERE `key` IN ('spouse','partner','relative','friend','neighbour','acquaintance','colleague','manager','report');--> statement-breakpoint
UPDATE `relationship_types` SET `from_kinds` = 'person,pet', `to_kinds` = 'person,pet' WHERE `key` IN ('parent','child','sibling','grandparent','grandchild');--> statement-breakpoint
UPDATE `relationship_types` SET `from_kinds` = 'person,organization', `to_kinds` = 'person' WHERE `key` IN ('employer','doctor');--> statement-breakpoint
UPDATE `relationship_types` SET `from_kinds` = 'person', `to_kinds` = 'person,organization' WHERE `key` IN ('employee','client');--> statement-breakpoint
UPDATE `relationship_types` SET `from_kinds` = 'person,organization', `to_kinds` = 'organization' WHERE `key` = 'member';--> statement-breakpoint
UPDATE `relationship_types` SET `from_kinds` = 'organization', `to_kinds` = 'person,organization' WHERE `key` = 'has_member';--> statement-breakpoint
UPDATE `relationship_types` SET `from_kinds` = 'person,organization', `to_kinds` = 'pet' WHERE `key` IN ('owner','vet');--> statement-breakpoint
UPDATE `relationship_types` SET `from_kinds` = 'pet', `to_kinds` = 'person,organization' WHERE `key` IN ('pet','patient');--> statement-breakpoint
INSERT INTO `relationship_types` (`key`, `label`, `inverse_key`, `category`, `sort_order`, `from_kinds`, `to_kinds`) VALUES
('supplier', 'Supplier', 'customer', 'work', 270, 'person,organization', 'person,organization'),
('customer', 'Customer', 'supplier', 'work', 280, 'person,organization', 'person,organization'),
('parent_company', 'Parent company', 'subsidiary', 'work', 290, 'organization', 'organization'),
('subsidiary', 'Subsidiary', 'parent_company', 'work', 295, 'organization', 'organization');
