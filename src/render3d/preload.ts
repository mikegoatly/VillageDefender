// Every model the game draws, loaded up front: the library throws for a model it hasn't loaded.

import { TOWN_MODELS } from './buildings';
import { characterModelPaths } from './characters';
import { EFFECT_MODELS } from './Effects';
import { FROST_MODELS } from './FrostView';

export function preloadModels(): string[] {
  return [...new Set([...characterModelPaths(), ...TOWN_MODELS, ...EFFECT_MODELS, ...FROST_MODELS])];
}
