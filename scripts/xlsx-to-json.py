# One-off converter: YGO_Online_Cards.xlsx -> game-data/online-cards.json (CardData shape) for the cards
# that are not in the unpacked Joey the Passion catalog. Needs `pip install openpyxl`; the importers read only the JSON.
import json, re, sys, pathlib
import openpyxl

root = pathlib.Path(__file__).resolve().parent.parent
catalog = (root / 'src/data/ygoCatalog.ts').read_text(encoding='utf-8')
known_names = {n.lower() for n in re.findall(r'"name": "((?:[^"\\]|\\.)*)"', catalog)}
known_names = {json.loads(f'"{n}"').lower() for n in known_names}
known_pcs = {p.lstrip('0') for p in re.findall(r'"passcode": "(\d+)"', catalog)}

rows = list(openpyxl.load_workbook(root / 'YGO_Online_Cards.xlsx', read_only=True)['Cards'].iter_rows(values_only=True))[1:]
by_konami = {r[9]: r[0] for r in rows}
SPELL = {'Normal': 'normal', 'Continuous': 'continuous', 'Equip': 'equip', 'Quick-Play': 'quickplay', 'Field': 'field', 'Ritual': 'ritual'}
TRAP = {'Normal': 'normal', 'Continuous': 'continuous', 'Counter': 'counter'}
out, seen = [], set()
for i, r in enumerate(rows):
    name, pc, ctype, attr, race, lv, atk, df, desc, konami = r[:10]
    if name.lower() in known_names or str(pc or '').lstrip('0') in known_pcs or name in seen:
        continue
    seen.add(name)
    desc = re.sub(r'%c(\d+)', lambda m: by_konami.get(int(m.group(1)), m.group(0)), desc or '')
    card = {'code': 100000 + konami, 'index': 10000 + i, 'name': name, 'desc': desc,
            'passcode': str(pc).zfill(8) if pc and len(str(pc)) <= 8 else str(pc or '')}
    if ctype in ('Spell', 'Trap'):
        card.update(kind=ctype.lower(), level=0, atk=0, def_=0)
        card['spellType' if ctype == 'Spell' else 'trapType'] = (SPELL if ctype == 'Spell' else TRAP)[race]
    else:
        mtype = 'fusion' if ctype.startswith('Fusion') else 'ritual' if ctype.startswith('Ritual') else 'normal' if ctype in ('Normal', 'Token') else 'effect'
        card.update(kind='monster', monsterType=mtype, race=race, attribute=attr, level=lv or 0, atk=atk or 0, def_=df or 0)
        if ctype in ('Gemini', 'Union', 'Spirit', 'Toon', 'Token'):
            card['ability'] = ctype.lower()
    card['def'] = card.pop('def_')
    out.append(card)
(root / 'game-data/online-cards.json').write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding='utf-8')
print(f'{len(out)} cards not in the catalog written to game-data/online-cards.json', file=sys.stderr)
