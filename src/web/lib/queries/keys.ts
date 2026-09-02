import type { ContactListQuery } from "@shared/schemas/contact";

export const contactKeys = {
  all: ["contacts"] as const,
  lists: () => [...contactKeys.all, "list"] as const,
  list: (q: Partial<ContactListQuery>) => [...contactKeys.lists(), q] as const,
  detail: (id: string) => [...contactKeys.all, "detail", id] as const,
  relationships: (id: string) => [...contactKeys.all, "relationships", id] as const,
  interactions: (id: string) => [...contactKeys.all, "interactions", id] as const,
  activity: (id: string) => [...contactKeys.all, "activity", id] as const,
  files: (id: string) => [...contactKeys.all, "files", id] as const,
  lifeEvents: (id: string) => [...contactKeys.all, "life-events", id] as const,
};

export const tagKeys = {
  all: ["tags"] as const,
};

export const relationshipTypeKeys = {
  all: ["relationship-types"] as const,
};

export const searchKeys = {
  query: (q: string) => ["search", q] as const,
};

export const interactionKeys = {
  all: ["interactions"] as const,
  detail: (id: string) => ["interactions", "detail", id] as const,
  recent: (limit: number) => ["interactions", "recent", limit] as const,
};
