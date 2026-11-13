import type { Difficulty } from '../engine/ai';
import type { DeckList } from '../engine/duel';
import { CARDS } from './cards';

interface Recipe {
  id: string;
  name: string;
  title: string;
  ace: string;
  style: string;
  suggested: Difficulty;
  main: Record<string, number>;
  extra?: Record<string, number>;
}

const recipes: Recipe[] = [
  {
    id: 'yugi', name: 'Yugi Muto', title: 'King of Games', ace: 'Dark Magician', style: 'Spellcasters and Magnet Warriors', suggested: 'hard',
    main: { 'Dark Magician': 2, 'Dark Magician Girl': 1, 'Summoned Skull': 1, 'Celtic Guardian': 2, 'Mystical Elf': 2, 'Giant Soldier of Stone': 2, 'Kuriboh': 2, 'Big Shield Gardna': 2, 'Alpha The Magnet Warrior': 2, 'Beta The Magnet Warrior': 2, 'Gamma The Magnet Warrior': 2, 'Valkyrion the Magna Warrior': 1, 'Buster Blader': 1, 'Gazelle the King of Mythical Beasts': 1, 'Berfomet': 1, 'Monster Reborn': 1, 'Pot of Greed': 1, 'Dark Magic Attack': 1, 'Thousand Knives': 1, 'Polymerization': 2, 'Swords of Revealing Light': 1, 'Brain Control': 1, 'Card Destruction': 1, 'Magical Hats': 2, 'Spellbinding Circle': 2, 'Magic Cylinder': 1, 'Mirror Force': 1, 'Lightforce Sword': 1 },
    extra: { 'Dark Paladin': 1, 'Chimera the Flying Mythical Beast': 1 },
  },
  {
    id: 'kaiba', name: 'Seto Kaiba', title: 'Dragon Master', ace: 'Blue-Eyes White Dragon', style: 'Blue-Eyes dragons and Kaiba machines', suggested: 'hard',
    main: { 'Blue-Eyes White Dragon': 3, 'Battle Ox': 2, 'La Jinn the Mystical Genie of the Lamp': 2, 'Saggi the Dark Clown': 2, 'Lord of D.': 2, 'Spear Dragon': 2, 'Luster Dragon #2': 2, 'Kaiser Glider': 1, 'Vorse Raider': 2, 'X-Head Cannon': 2, 'Y-Dragon Head': 2, 'Z-Metal Tank': 2, 'The Flute of Summoning Dragon': 2, 'Polymerization': 2, 'Cost Down': 2, 'Enemy Controller': 2, 'Shrink': 2, 'Monster Reborn': 1, 'Crush Card': 1, 'Ring of Destruction': 1, 'Negate Attack': 1, 'Shadow Spell': 2 },
    extra: { 'Blue-Eyes Ultimate Dragon': 1, 'XY-Dragon Cannon': 1, 'XZ-Tank Cannon': 1, 'YZ-Tank Dragon': 1, 'XYZ-Dragon Cannon': 1 },
  },
  {
    id: 'joey', name: 'Joey Wheeler', title: 'Red-Eyes Duelist', ace: 'Red-Eyes B. Dragon', style: 'Warriors, Red-Eyes and risky tricks', suggested: 'normal',
    main: { 'Red-Eyes B. Dragon': 2, 'Baby Dragon': 2, 'Time Wizard': 2, 'Gearfried the Iron Knight': 2, 'Rocket Warrior': 2, 'Alligator\u0027s Sword': 2, 'Panther Warrior': 2, 'Jinzo': 1, 'Flame Manipulator': 2, 'Masaki the Legendary Swordsman': 2, 'Swordsman of Landstar': 2, 'Goblin Attack Force': 2, 'Scapegoat': 2, 'Polymerization': 2, 'Graceful Dice': 2, 'Axe of Despair': 1, 'Monster Reborn': 1, 'Pot of Greed': 1, 'Graceful Charity': 1, 'Skull Dice': 2, 'Kunai with Chain': 2, 'Negate Attack': 1, 'Magic Cylinder': 1, 'Time Machine': 1 },
    extra: { 'Flame Swordsman': 2, 'Thousand Dragon': 2, 'Alligator\u0027s Sword Dragon': 1 },
  },
  {
    id: 'mai', name: 'Mai Valentine', title: 'Harpie Duelist', ace: 'Harpie Lady Sisters', style: 'Harpies, Amazoness and battle tricks', suggested: 'normal',
    main: { 'Harpie Lady': 3, 'Cyber Harpie': 2, 'Harpie Lady Sisters': 2, 'Harpie\u0027s Pet Dragon': 2, 'Amazoness Swords Woman': 2, 'Amazoness Fighter': 2, 'Amazoness Chain Master': 2, 'Amazoness Tiger': 2, 'Dunames Dark Witch': 2, 'The Unfriendly Amazon': 2, 'Elegant Egotist': 3, 'Cyber Shield': 2, 'Harpies\u0027 Hunting Ground': 2, 'Harpie\u0027s Feather Duster': 1, 'Graceful Charity': 1, 'Amazoness Spellcaster': 2, 'Mirror Wall': 2, 'Amazoness Archers': 2, 'Dramatic Rescue': 2, 'Gravity Bind': 1, 'Windstorm of Etaqua': 1 },
  },
  {
    id: 'pegasus', name: 'Maximillion Pegasus', title: 'Toon Creator', ace: 'Toon Summoned Skull', style: 'Toons and the power of Relinquished', suggested: 'normal',
    main: { 'Toon Summoned Skull': 2, 'Toon Mermaid': 3, 'Blue-Eyes Toon Dragon': 1, 'Manga Ryu-Ran': 2, 'Toon Alligator': 3, 'Relinquished': 2, 'Thousand-Eyes Idol': 2, 'Illusionist Faceless Mage': 2, 'Dark-Eyes Illusionist': 2, 'Toon World': 3, 'Toon Table of Contents': 3, 'Black Illusion Ritual': 2, 'Polymerization': 2, 'Pot of Greed': 1, 'Graceful Charity': 1, 'Toon Cannon Soldier': 1, 'Toon Defense': 2, 'Trap Hole': 2, 'Magic Jammer': 1, 'Solemn Judgment': 1, 'Toon Masked Sorcerer': 2 },
    extra: { 'Thousand-Eyes Restrict': 2 },
  },
  {
    id: 'jaden', name: 'Jaden Yuki', title: 'Elemental HERO', ace: 'Elemental Hero Flame Wingman', style: 'Elemental HERO fusions and Skyscraper', suggested: 'normal',
    main: { 'Elemental Hero Avian': 3, 'Elemental Hero Burstinatrix': 3, 'Elemental Hero Clayman': 3, 'Elemental Hero Sparkman': 3, 'Elemental Hero Bubbleman': 2, 'Elemental Hero Wildheart': 2, 'Elemental Hero Bladedge': 2, 'Winged Kuriboh': 2, 'Wroughtweiler': 2, 'Polymerization': 3, 'Fusion Recovery': 2, 'Skyscraper': 2, 'H - Heated Heart': 2, 'E - Emergency Call': 2, 'R - Righteous Justice': 1, 'O - Oversoul': 1, 'Spark Blaster': 1, 'Hero Signal': 2, 'Negate Attack': 1, 'Hero Barrier': 1 },
    extra: { 'Elemental Hero Flame Wingman': 2, 'Elemental Hero Thunder Giant': 2, 'Elemental Hero Steam Healer': 1, 'Elemental Hero Rampart Blaster': 1, 'Elemental Hero Wildedge': 1, 'Elemental Hero Shining Flare Wingman': 1 },
  },
  {
    id: 'zane', name: 'Zane Truesdale', title: 'Cyber Dragon', ace: 'Cyber Dragon', style: 'Cyber Dragons and Power Bond fusions', suggested: 'hard',
    main: { 'Cyber Dragon': 3, 'Proto-Cyber Dragon': 3, 'Cyber Phoenix': 3, 'Cyber Kirin': 2, 'Cyber Barrier Dragon': 2, 'Cyber Laser Dragon': 2, 'Cyber Ogre': 2, 'Cyber Valley': 1, 'Cyberdark Horn': 2, 'Cyberdark Edge': 2, 'Cyberdark Keel': 2, 'Power Bond': 3, 'Polymerization': 2, 'De-Fusion': 2, 'Limiter Removal': 1, 'Future Fusion': 1, 'Overload Fusion': 1, 'Cybernetic Hidden Technology': 2, 'Attack Reflector Unit': 2, 'Cyber Shadow Gardna': 2 },
    extra: { 'Cyber Twin Dragon': 2, 'Cyber End Dragon': 2, 'Chimeratech Overdragon': 1, 'Cyberdark Dragon': 1 },
  },
  {
    id: 'syrus', name: 'Syrus Truesdale', title: 'Vehicroid Driver', ace: 'Steam Gyroid', style: 'Vehicroids and machine fusions', suggested: 'easy',
    main: { 'Steamroid': 3, 'Gyroid': 3, 'Drillroid': 3, 'Submarineroid': 3, 'Cycroid': 2, 'Expressroid': 2, 'Jetroid': 2, 'Truckroid': 2, 'UFOroid': 2, 'Rescueroid': 2, 'Ambulanceroid': 2, 'Polymerization': 3, 'Vehicroid Connection Zone': 2, 'Fusion Recovery': 2, 'Limiter Removal': 1, 'De-Fusion': 1, 'Supercharge': 2, 'Patroid': 2, 'Damage Condenser': 1 },
    extra: { 'Steam Gyroid': 2, 'Super Vehicroid Jumbo Drill': 2, 'Ambulance Rescueroid': 1 },
  },
  {
    id: 'crowler', name: 'Dr. Crowler', title: 'Ancient Gear Professor', ace: 'Ancient Gear Golem', style: 'Ancient Gear monsters and Castle counters', suggested: 'hard',
    main: { 'Ancient Gear Golem': 3, 'Ancient Gear Beast': 2, 'Ancient Gear Soldier': 3, 'Ancient Gear': 3, 'Ancient Gear Cannon': 2, 'Ancient Gear Engineer': 2, 'The Trojan Horse': 2, 'Ancient Gear Castle': 3, 'Ancient Gear Tank': 2, 'Ancient Gear Drill': 2, 'Ancient Gear Factory': 2, 'Ancient Gear Fist': 2, 'Ancient Gear Workshop': 2, 'Ancient Gear Explosive': 2, 'Limiter Removal': 1, 'Heavy Storm': 1, 'Polymerization': 2, 'Statue of the Wicked': 2, 'Damage Condenser': 1, 'Zero Gravity': 1 },
    extra: { 'Ultimate Ancient Gear Golem': 1 },
  },
  {
    id: 'exodia', name: 'Exodia Seeker', title: 'Forbidden One', ace: 'Exodia the Forbidden One', style: 'Draw and defend until Exodia is complete', suggested: 'hard',
    main: { 'Exodia the Forbidden One': 1, 'Left Arm of the Forbidden One': 1, 'Right Arm of the Forbidden One': 1, 'Left Leg of the Forbidden One': 1, 'Right Leg of the Forbidden One': 1, 'Sangan': 3, 'Witch of the Black Forest': 3, 'Emissary of the Afterlife': 3, 'Royal Magical Library': 3, 'Mystic Tomato': 3, 'Pot of Greed': 1, 'Graceful Charity': 1, 'Upstart Goblin': 3, 'Reload': 2, 'Card Destruction': 1, 'Dark Factory of Mass Production': 2, 'Swords of Revealing Light': 2, 'Messenger of Peace': 2, 'Backup Soldier': 3, 'Gravity Bind': 2, 'Jar of Greed': 1 },
  },
  {
    id: 'bakura', name: 'Yami Bakura', title: 'Master of the Occult', ace: 'Dark Necrofear', style: 'Fiends and Destiny Board', suggested: 'hard',
    main: { 'Dark Necrofear': 2, 'Dark Ruler Ha Des': 2, 'Newdoria': 3, 'Dark Jeroid': 2, 'Giant Germ': 3, 'Sangan': 1, 'Mystic Tomato': 3, 'Archfiend Soldier': 3, 'Dark Mimic LV1': 2, 'Dark Mimic LV3': 2, 'The Gross Ghost of Fled Dreams': 2, 'Destiny Board': 1, 'Spirit Message \u0022I\u0022': 1, 'Spirit Message \u0022N\u0022': 1, 'Spirit Message \u0022A\u0022': 1, 'Spirit Message \u0022L\u0022': 1, 'The Dark Door': 2, 'Dark Spirit of the Silent': 2, 'Fissure': 2, 'Mystical Space Typhoon': 2, 'Ectoplasmer': 2, 'Call Of The Haunted': 1, 'Magic Cylinder': 1 },
  },
  {
    id: 'marik', name: 'Marik Ishtar', title: 'Shadow Duelist', ace: 'Lava Golem', style: 'Lava Golem, traps and effect damage', suggested: 'hard',
    main: { 'Lava Golem': 2, 'Newdoria': 3, 'Dark Jeroid': 2, 'Drillago': 2, 'Mystic Tomato': 3, 'Lava Battleguard': 2, 'Helpoemer': 2, 'Nightmare Wheel': 3, 'Mask of the Accursed': 3, 'Mask of Weakness': 2, 'Mask of Restrict': 2, 'Nightmare\u0027s Steelcage': 2, 'Swords of Revealing Light': 2, 'Card Destruction': 1, 'Pot of Greed': 1, 'Monster Reborn': 1, 'Bowganian': 3, 'Des Koala': 2, 'Secret Barrel': 2, 'Just Desserts': 2, 'Dark Room of Nightmare': 2, 'Magic Cylinder': 1 },
  },
  {
    id: 'mako', name: 'Mako Tsunami', title: 'Ocean Duelist', ace: 'The Legendary Fisherman', style: 'Umi, sea monsters and Tornado Wall', suggested: 'normal',
    main: { 'The Legendary Fisherman': 2, 'Kairyu-Shin': 2, 'Fortress Whale': 1, 'A Legendary Ocean': 3, 'Umi': 3, 'Tornado Wall': 2, 'Mother Grizzly': 3, 'Deepsea Warrior': 2, 'Amphibian Beast': 2, 'Great White': 2, 'Fiend Kraken': 2, '7 Colored Fish': 2, 'Levia-Dragon - Daedalus': 2, 'Sea Serpent Warrior of Darkness': 2, 'Penguin Soldier': 2, 'Star Boy': 2, 'Aqua Spirit': 2, 'Salvage': 2, 'Steel Shell': 2, 'Fortress Whale\u0027s Oath': 2, 'Torrential Tribute': 1, 'Gravity Bind': 1, 'Ocean Dragon Lord - Neo-Daedalus': 1 },
  },
  {
    id: 'weevil', name: 'Weevil Underwood', title: 'Insect Duelist', ace: 'Insect Queen', style: 'Insects and Great Moth evolution', suggested: 'normal',
    main: { 'Insect Queen': 2, 'Petit Moth': 3, 'Cocoon of Evolution': 3, 'Great Moth': 2, 'Perfectly Ultimate Great Moth': 1, 'Basic Insect': 3, 'Man-Eater Bug': 3, 'Flying Kamakiri #1': 3, 'Killer Needle': 2, 'Kuwagata Alpha': 2, 'Hercules Beetle': 2, 'Pinch Hopper': 2, 'Giant Rat': 2, 'Forest': 2, 'Insect Armor with Laser Cannon': 2, 'Laser Cannon Armor': 2, 'Insect Barrier': 2, 'DNA Surgery': 2, 'Gokipon': 2, 'Insect Imitation': 2, 'Chain Destruction': 1, 'Multiplication of Ants': 1 },
    extra: { 'Kwagar Hercules': 1 },
  },
  {
    id: 'chazz', name: 'Chazz Princeton', title: 'Armed Dragon Duelist', ace: 'Armed Dragon LV7', style: 'Armed Dragons and Ojamas', suggested: 'hard',
    main: { 'Armed Dragon LV3': 3, 'Armed Dragon LV5': 3, 'Armed Dragon LV7': 2, 'Armed Dragon LV10': 1, 'Ojama Yellow': 3, 'Ojama Green': 3, 'Ojama Black': 3, 'Masked Dragon': 3, 'Flying Kamakiri #1': 2, 'Lord of D.': 2, 'The Flute of Summoning Dragon': 2, 'Level Up!': 2, 'Level Modulation': 2, 'Ojamagic': 2, 'Ojama Delta Hurricane!!': 2, 'Polymerization': 2, 'Fusion Recovery': 1, 'Ojama Trio': 2, 'Dust Tornado': 2, 'Sakuretsu Armor': 2 },
    extra: { 'Ojama King': 2, 'Ojama Knight': 1 },
  },
  {
    id: 'aster', name: 'Aster Phoenix', title: 'Destiny HERO', ace: 'Destiny Hero - Plasma', style: 'Destiny HERO graveyard tactics', suggested: 'hard',
    main: { 'Destiny Hero - Plasma': 1, 'Destiny Hero - Dogma': 1, 'Destiny Hero - Dasher': 2, 'Destiny Hero - Diamond Dude': 3, 'Destiny Hero - Doom Lord': 2, 'Destiny Hero - Defender': 2, 'Destiny Hero - Fear Monger': 3, 'Destiny Hero - Malicious': 2, 'Destiny Hero - Captain Tenacious': 2, 'Destiny Hero - Dunker': 2, 'Destiny Hero - Blade Master': 2, 'Destiny Hero - Double Dude': 2, 'Destiny Draw': 3, 'Clock Tower Prison': 2, 'Over Destiny': 2, 'D - Spirit': 2, 'Dark City': 2, 'Mystical Space Typhoon': 2, 'Destiny Signal': 3, 'Destiny Mirage': 2, 'Destruction of Destiny': 2 },
    extra: { 'Destiny End Dragoon': 1 },
  },
  {
    id: 'jaden-neos', name: 'Jaden Yuki - Neo Space', title: 'Neo-Spacian Hero', ace: 'Elemental Hero Neos', style: 'Neo-Spacians and Neos contact fusions', suggested: 'hard',
    main: { 'Elemental Hero Neos': 3, 'Elemental Hero Neos Alius': 2, 'Neo-Spacian Air Hummingbird': 2, 'Neo-Spacian Aqua Dolphin': 2, 'Neo-Spacian Dark Panther': 2, 'Neo-Spacian Flare Scarab': 2, 'Neo-Spacian Glow Moss': 2, 'Neo-Spacian Grand Mole': 2, 'Neo Space Pathfinder': 2, 'Elemental Hero Prisma': 2, 'Elemental Hero Stratos': 1, 'Winged Kuriboh': 2, 'Neo Space': 3, 'Instant Neo Space': 2, 'Convert Contact': 2, 'Common Soul': 2, 'Neos Force': 2, 'Swing of Memories': 2, 'E - Emergency Call': 2, 'O - Oversoul': 1, 'Hero Signal': 2, 'Hero Barrier': 1, 'Negate Attack': 1 },
    extra: { 'Elemental Hero Air Neos': 1, 'Elemental Hero Aqua Neos': 1, 'Elemental Hero Dark Neos': 1, 'Elemental Hero Flare Neos': 1, 'Elemental Hero Glow Neos': 1, 'Elemental Hero Grand Neos': 1, 'Elemental Hero Magma Neos': 1, 'Elemental Hero Storm Neos': 1 },
  },
  {
    id: 'jesse', name: 'Jesse Anderson', title: 'Crystal Beast Duelist', ace: 'Crystal Beast Sapphire Pegasus', style: 'Crystal Beasts and Rainbow Dragon', suggested: 'hard',
    main: { 'Crystal Beast Sapphire Pegasus': 3, 'Crystal Beast Ruby Carbuncle': 2, 'Crystal Beast Amber Mammoth': 2, 'Crystal Beast Amethyst Cat': 2, 'Crystal Beast Cobalt Eagle': 2, 'Crystal Beast Emerald Tortoise': 2, 'Crystal Beast Topaz Tiger': 3, 'Rainbow Dragon': 2, 'Crystal Seer': 2, 'Ancient City - Rainbow Ruins': 3, 'Crystal Beacon': 2, 'Crystal Blessing': 2, 'Crystal Promise': 3, 'Crystal Release': 2, 'Crystal Abundance': 2, 'Crystal Tree': 2, 'Crystal Raigeki': 2, 'Rainbow Gravity': 2, 'Rainbow Path': 2, 'Crystal Counter': 2 },
  },
  {
    id: 'axel', name: 'Axel Brodie', title: 'Volcanic Duelist', ace: 'Volcanic Doomfire', style: 'Volcanic monsters and Blaze Accelerator', suggested: 'hard',
    main: { 'Volcanic Doomfire': 2, 'Volcanic Rocket': 3, 'Volcanic Shell': 3, 'Volcanic Scattershot': 3, 'Volcanic Blaster': 3, 'Volcanic Slicer': 3, 'Volcanic Hammerer': 2, 'Volcanic Counter': 2, 'Volcanic Rat': 2, 'UFO Turtle': 2, 'Blaze Accelerator': 3, 'Tri-Blaze Accelerator': 2, 'Volcanic Recharge': 2, 'Wild Fire': 2, 'Molten Destruction': 2, 'Reload': 2, 'Backfire': 2, 'Fire Darts': 2, 'Trap Hole': 2 },
  },
  {
    id: 'bastion', name: 'Bastion Misawa', title: 'Water Dragon Alchemist', ace: 'Water Dragon', style: 'Hydrogeddon, Oxygeddon and Bonding', suggested: 'normal',
    main: { 'Water Dragon': 2, 'Hydrogeddon': 3, 'Oxygeddon': 3, 'Water Magician': 2, 'Mother Grizzly': 3, 'Aqua Spirit': 2, '7 Colored Fish': 2, 'Penguin Soldier': 2, 'UFO Turtle': 2, 'Flame Ruler': 2, 'Bonding - H2O': 3, 'Salvage': 2, 'Umiiruka': 2, 'Terraforming': 1, 'Reload': 2, 'Mystical Space Typhoon': 2, 'Torrential Tribute': 1, 'Dust Tornado': 2, 'Sakuretsu Armor': 2, 'Waboku': 2, 'Magic Cylinder': 1 },
  },
  {
    id: 'alexis', name: 'Alexis Rhodes', title: 'Cyber Blader', ace: 'Cyber Blader', style: 'Cyber dancers and fusion combinations', suggested: 'normal',
    main: { 'Blade Skater': 3, 'Etoile Cyber': 3, 'Cyber Tutu': 3, 'Cyber Prima': 2, 'Cyber Gymnast': 3, 'Cyber Kirin': 2, 'Dunames Dark Witch': 2, 'Amazoness Swords Woman': 2, 'Amazoness Fighter': 2, 'Warrior Lady of the Wasteland': 2, 'Polymerization': 3, 'Fusion Recovery': 2, 'Fusion Sage': 2, 'Fusion Weapon': 1, 'Mystical Space Typhoon': 2, 'Reinforcement of the Army': 1, 'Sakuretsu Armor': 2, 'Mirror Wall': 2, 'Waboku': 2, 'Negate Attack': 1, 'Magic Cylinder': 1 },
    extra: { 'Cyber Blader': 2 },
  },
  {
    id: 'orichalcos', name: 'Orichalcos', title: 'The Seal of Orichalcos', ace: 'The Seal of Orichalcos',
    style: 'Field Spell and Warrior beatdown', suggested: 'normal',
    main: {
      'The Seal of Orichalcos': 2, 'Terraforming': 2, 'Gearfried the Iron Knight': 3, 'Goblin Attack Force': 3,
      'Marauding Captain': 3, 'Command Knight': 3, 'D.D. Warrior Lady': 2, 'Exiled Force': 2, 'Blade Knight': 2,
      'Spear Dragon': 2, 'Reinforcement of the Army': 2, 'The Warrior Returning Alive': 2, 'Mystical Space Typhoon': 2,
      'Book of Moon': 2, 'Smashing Ground': 2, 'Mirror Force': 1, 'Sakuretsu Armor': 3, 'Dust Tornado': 2,
    },
  },
];

const byName = new Map(CARDS.map(card => [card.name, card]));
const additions: Record<string, Record<string, number>> = {
  yugi: { 'Dark Magic Curtain': 1, 'Dark Magic Ritual': 1, 'Magician of Black Chaos': 1, 'Diffusion Wave-Motion': 1, 'Multiply': 1, 'Mystical Space Typhoon': 1 },
  kaiba: { 'Burst Stream of Destruction': 2, 'Kaibaman': 2, 'Kaiser Sea Horse': 2, 'Soul Exchange': 1 },
  joey: { 'Red-Eyes B. Chick': 2, 'Red-Eyes Black Metal Dragon': 1, 'Metalmorph': 2, 'Monster Recovery': 1, 'Shield & Sword': 1 },
  mai: { 'Harpie Queen': 2, 'Harpie\u0027s Pet Baby Dragon': 2, 'Amazoness Paladin': 2, 'Amazoness Blowpiper': 1 },
  pegasus: { 'Toon Dark Magician Girl': 2, 'Toon Gemini Elf': 2, 'Toon Goblin Attack Force': 1, 'Wall of Illusion': 2 },
  jaden: { 'Elemental Hero Necroshade': 2, 'Elemental Hero Woodsman': 2, 'Clay Charge': 1, 'Burst Return': 1, 'HERO Flash!!': 1, 'A Hero Emerges': 1 },
  zane: { 'Cyberdark Impact!': 2, 'Cyber Summon Blaster': 2, 'Photon Generator Unit': 2 },
  syrus: { 'Stealthroid': 2, 'Carrierroid': 2, 'Decoyroid': 2, 'Cybernetic Zone': 1 },
  crowler: { 'Ancient Gear Knight': 2, 'Ancient Gear Gadjiltron Dragon': 1, 'Ancient Gear Gadjiltron Chimera': 1, 'Gear Golem the Moving Fortress': 2 },
};
const revisions: Record<string, { main: Record<string, number>; extra: Record<string, number> }> = {
  jaden: {
    main: { 'Elemental Hero Neos': 2, 'Neo-Spacian Air Hummingbird': 1, 'Neo-Spacian Aqua Dolphin': 1, 'Neo-Spacian Grand Mole': 1, 'Neo Space': 1, 'Common Soul': 1 },
    extra: { 'Elemental Hero Air Neos': 1, 'Elemental Hero Aqua Neos': 1, 'Elemental Hero Grand Neos': 1 },
  },
};
function expand(counts: Record<string, number>): string[] {
  return Object.entries(counts).flatMap(([name, count]) => {
    const card = byName.get(name);
    if (!card) throw new Error(`Premade card unavailable: ${name}`);
    return Array<string>(count).fill(card.id);
  });
}

export const PREVIOUS_PREMADE = recipes.filter(recipe => recipe.id in additions || recipe.id === 'exodia').map(({ main, extra, ...opponent }) => ({
  ...opponent,
  art: '*',
  deck: { main: expand(main), extra: expand(extra ?? {}) } satisfies DeckList,
})).concat(recipes.filter(recipe => recipe.id in revisions).map(({ main, extra, ...opponent }) => ({
  ...opponent,
  art: '*',
  deck: { main: [...expand(main), ...expand(additions[opponent.id] ?? {})], extra: expand(extra ?? {}) } satisfies DeckList,
})));

export const PREMADE = recipes.map(({ main, extra, ...opponent }) => ({
  ...opponent,
  art: '*',
  deck: { main: [...expand(main), ...expand(additions[opponent.id] ?? {}), ...expand(revisions[opponent.id]?.main ?? {})], extra: [...expand(extra ?? {}), ...expand(revisions[opponent.id]?.extra ?? {})] } satisfies DeckList,
}));
