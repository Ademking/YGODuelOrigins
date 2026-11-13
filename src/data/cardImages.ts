import { CARD_PROVENANCE } from './sourceCards';
import { YGO_CATALOG } from './ygoCatalog';

const PROVENANCE = CARD_PROVENANCE as Record<string, { passcode: string } | undefined>;
const CATALOG_PASSCODES = new Map(YGO_CATALOG.map(card => [`ygo_${card.code}`, card.passcode]));
const CARD_IMAGE_IDS: Record<string, number> = {
  seal_of_orichalcos: 48179391,
  god_slifer: 10000020,
  god_ra: 10000010,
  god_obelisk: 10000000,
  ygo_103915: 14470846,
  ygo_705: 66516792,
  ygo_710: 38277918,
  ygo_707: 38999506,
  ygo_341: 84257640,
  ygo_704: 39111158,
  ygo_357: 6740720,
  ygo_365: 67284908,
  ygo_1920: 91512836,
  ygo_1921: 40703223,
  ygo_1922: 73915052,
  ygo_1923: 21770261,
  ygo_216: 11901678,
  ygo_379: 23995346,
  ygo_91: 94905343,
  // Token cards
  ygo_103906: 22493812, // Army Ant Token
  ygo_103921: 48115278, // Block Token
  ygo_103911: 86871615, // Clone Token
  ygo_103933: 56597273, // Cloudian Token
  ygo_103940: 46173680, // Doomsday Token
  ygo_103929: 28355719, // Double Dude Token
  ygo_103922: 44330099, // Emissary of Darkness Token
  ygo_103934: 82556059, // Engine Token
  ygo_103930: 64382840, // Eva Token
  ygo_103939: 75524093, // Evil Token
  ygo_103931: 98596597, // Fireball Token
  ygo_103925: 15341822, // Fluffy Token
  ygo_103936: 75732623, // Grinder Token
  ygo_103918: 60764582, // Lamb Token
  ygo_103910: 62543394, // Lekunga Token
  ygo_103943: 49808197, // Metabo Token
  ygo_103914: 24874631, // Metal Fiend Token
  ygo_103913: 63442605, // Mirage Token
  ygo_103942: 97452818, // Moon Token
  ygo_103927: 93130022, // Option Token
  ygo_103923: 69890968, // Phantasm Token
  ygo_103924: 93224849, // Phantasmal Martyr Token
  ygo_103909: 86801872, // Poisonous Snake Token
  ygo_103937: 31986289, // Regenerating Rose Token
  ygo_103941: 60406592, // Sinister Seed Token
  ygo_103935: 12958920, // Skyblaster Token
  ygo_103928: 16946850, // Synthetic Seraphim Token
  ygo_103938: 14089429, // Thunder Option Token
  ygo_103920: 75622825, // Tricky Token
  ygo_103912: 12965762, // Wicked Plant Token
  ygo_103908: 65810490, // Wicked Token
  ygo_103932: 68815402, // Wild Fire Token
};

export function cardImagePasscode(id: string): string | null {
  const passcode = (id.startsWith('ocg_') ? id.slice(4) : undefined) || PROVENANCE[id]?.passcode || CATALOG_PASSCODES.get(id) || CARD_IMAGE_IDS[id];
  return passcode ? String(Number(passcode)) : null;
}
