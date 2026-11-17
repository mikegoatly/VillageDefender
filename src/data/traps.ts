// Traps (decision 52): a villager runs to where the knight stood and sets a trap that wears itself out on monsters.

export const TRAP = {
  /** Traps on the field (set or still being set) at once, before upgrades. */
  cap: 2,
  /** Seconds before the power can be used again; refunded if the villager is caught on the way. */
  cooldown: 9,
  /** Villager run speed (cells per second) and seconds spent setting the trap on arrival. */
  runnerSpeed: 2.6,
  setTime: 6,
  /** Extra reach (cells) a monster needs to catch the runner, added to its own radius. */
  catchReach: 0.2,
  radius: 1.3,
  /**
   * Damage the trap can deal before it is spent, counted before the boss reduction so a boss
   * soaks up the budget twice as fast as it loses health (a boss loses at most `budget × bossMul`).
   */
  budget: 160,
  /** Damage per second to every monster in range, applied in pulses. */
  dps: 40,
  pulse: 0.25,
  /** Seconds a trap's slow outlasts the pulse that applied it, so it never flickers off between pulses. */
  slowLinger: 0.1,
  /** Bosses take this fraction of the damage (they are tanks; traps only chip). */
  bossMul: 0.5,
} as const;
