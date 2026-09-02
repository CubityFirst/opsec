-- "Member of" is for any group (a family, a club, a band…), not just work.
UPDATE `relationship_types` SET `category` = 'group', `to_kinds` = 'organization' WHERE `key` = 'member';
UPDATE `relationship_types` SET `category` = 'group', `from_kinds` = 'organization' WHERE `key` = 'has_member';
