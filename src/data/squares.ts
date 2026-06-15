import raw from "./squares.json";

export type SquareType = "header" | "bronze" | "silver" | "gold" | "milestone";

export interface HeaderSquare {
  type: "header";
  title: string;
  desc: string;
}
export interface StepSquare {
  type: "bronze" | "silver" | "gold" | "milestone";
  number: number | string;
  title: string;
  desc: string;
  criteria: string[];
}
export type Square = HeaderSquare | StepSquare;

export const squares = raw as Square[];

/** Stable string id for a step (the number can be a numeric badge or an emoji for milestones). */
export function stepKey(s: StepSquare): string {
  return String(s.number);
}

/** Numeric step number used for DB persistence. Milestones get synthetic numbers 1000+. */
export function stepDbNumber(s: StepSquare, indexInArray: number): number {
  if (typeof s.number === "number") return s.number;
  // milestone -> use 1000 + index so it's stable across loads
  return 1000 + indexInArray;
}
