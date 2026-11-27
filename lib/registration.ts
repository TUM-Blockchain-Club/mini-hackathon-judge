import { z } from 'zod';
import { teamNamePattern, teamNameHint } from './team-name';

const namePart = z
  .string()
  .trim()
  .min(1, 'Enter a first name and surname for each member.')
  .max(80, 'Names can have up to 80 characters.');
const existingName = z
  .string()
  .min(1, 'Enter a team name.')
  .max(80, 'Use up to 80 characters for your team name.');
export const teamNameInput = existingName.regex(teamNamePattern, teamNameHint);
export const rosterInput = z.object({
  name: teamNameInput,
  members: z
    .array(z.object({ firstName: namePart, surname: namePart }))
    .min(1, 'Add at least one member.')
    .max(3, 'A team can have up to three members.'),
});
const password = z
  .string()
  .min(10, 'Use at least 10 characters for the team password.')
  .max(128, 'Use up to 128 characters for the password.');
export const createInput = rosterInput.extend({ password });
export const editInput = rosterInput.extend({
  // Existing registrations may predate the handle format. Validate changes under the row lock.
  name: existingName,
  revision: z.number().int().nonnegative(),
  password: password.optional(),
});
export const loginInput = z.object({
  name: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(128),
});
export type Member = z.infer<typeof rosterInput>['members'][number];
export type TeamProfile = {
  id: string;
  name: string;
  members: Member[];
  revision: number;
};

export type DirectoryTeam = { name: string; memberCount: number | null };
