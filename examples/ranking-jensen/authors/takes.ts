export const subjects = [
  { take: "wife", label: "My wife", tier: "d" },
  { take: "trump", label: "Trump", tier: "b" },
  { take: "kimberly", label: "Kimberly", tier: "c" },
  { take: "alice", label: "Alice", tier: "a" },
  { take: "jacket", label: "My jacket", tier: "s" },
] as const;
export type Take = typeof subjects[number]["take"];
