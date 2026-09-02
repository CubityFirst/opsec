-- A pet can be a member of an organisation (mascot, therapy dog, clinic resident).
UPDATE `relationship_types` SET `from_kinds` = 'person,pet,organization' WHERE `key` = 'member';--> statement-breakpoint
UPDATE `relationship_types` SET `to_kinds` = 'person,pet,organization' WHERE `key` = 'has_member';
