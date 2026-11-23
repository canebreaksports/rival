// Where a player's progress on a weekly set is saved (localStorage). A set's `rev` is bumped when the owner resets it
// (npm run sets -- --reset <slug>), which gives everyone a fresh run of that set without touching the others.
export const progressKey = (s: { key: string; rev?: number }) => (s.rev ? `${s.key}#r${s.rev}` : s.key);
