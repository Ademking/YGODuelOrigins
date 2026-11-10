// Card behaviours for the YGO Online card pool (YGO_Online_Cards.xlsx entries missing from the original catalog). Generated list.
import type { Def } from './olib';
import { MONSTERS_1 } from './monsters1';
import { MONSTERS_10 } from './monsters10';
import { MONSTERS_11 } from './monsters11';
import { MONSTERS_12 } from './monsters12';
import { MONSTERS_13 } from './monsters13';
import { MONSTERS_2 } from './monsters2';
import { MONSTERS_3 } from './monsters3';
import { MONSTERS_4 } from './monsters4';
import { MONSTERS_5 } from './monsters5';
import { MONSTERS_6 } from './monsters6';
import { MONSTERS_7 } from './monsters7';
import { MONSTERS_8 } from './monsters8';
import { MONSTERS_9 } from './monsters9';
import { SPELLS_1 } from './spells1';
import { SPELLS_2 } from './spells2';
import { SPELLS_3 } from './spells3';
import { SPELLS_4 } from './spells4';
import { TRAPS_1 } from './traps1';
import { TRAPS_2 } from './traps2';
import { TRAPS_3 } from './traps3';
import { TRAPS_4 } from './traps4';

export const ONLINE: Record<string, Def> = { ...MONSTERS_1, ...MONSTERS_10, ...MONSTERS_11, ...MONSTERS_12, ...MONSTERS_13, ...MONSTERS_2, ...MONSTERS_3, ...MONSTERS_4, ...MONSTERS_5, ...MONSTERS_6, ...MONSTERS_7, ...MONSTERS_8, ...MONSTERS_9, ...SPELLS_1, ...SPELLS_2, ...SPELLS_3, ...SPELLS_4, ...TRAPS_1, ...TRAPS_2, ...TRAPS_3, ...TRAPS_4 };
