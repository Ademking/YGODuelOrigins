// Cards played by their 2004 rules instead of Project Ignis's current errata. Each entry replaces the card's Lua script
// and its database text; scripts/trim-ocgcore.ts writes them into the bundle the game downloads, so the engine, the
// card details and the tests all see the same card.

export interface Override { script: string; text: string }

export const OVERRIDES: Record<number, Override> = {
  // 2017 errata: only during the opponent's turn, only a monster whose ATK is at most the opponent's LP, once per turn.
  // 2004: any time a Normal Trap can be activated, any face-up monster, both players take its ATK.
  83555666: {
    text: "Destroy 1 face-up Monster Card and inflict Direct Damage equal to the destroyed card's ATK to the Life Points of both you and your opponent.",
    script: `--Ring of Destruction (2004 text)
local s,id=GetID()
function s.initial_effect(c)
	local e1=Effect.CreateEffect(c)
	e1:SetCategory(CATEGORY_DESTROY+CATEGORY_DAMAGE)
	e1:SetType(EFFECT_TYPE_ACTIVATE)
	e1:SetProperty(EFFECT_FLAG_CARD_TARGET)
	e1:SetCode(EVENT_FREE_CHAIN)
	e1:SetHintTiming(0,TIMINGS_CHECK_MONSTER_E)
	e1:SetTarget(s.target)
	e1:SetOperation(s.activate)
	c:RegisterEffect(e1)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)
	if chkc then return chkc:IsLocation(LOCATION_MZONE) and chkc:IsFaceup() end
	if chk==0 then return Duel.IsExistingTarget(Card.IsFaceup,tp,LOCATION_MZONE,LOCATION_MZONE,1,nil) end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_DESTROY)
	local g=Duel.SelectTarget(tp,Card.IsFaceup,tp,LOCATION_MZONE,LOCATION_MZONE,1,1,nil)
	Duel.SetOperationInfo(0,CATEGORY_DESTROY,g,1,0,0)
	Duel.SetOperationInfo(0,CATEGORY_DAMAGE,nil,0,PLAYER_ALL,g:GetFirst():GetAttack())
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
	local tc=Duel.GetFirstTarget()
	if not (tc:IsRelateToEffect(e) and tc:IsFaceup()) then return end
	local atk=math.max(tc:GetAttack(),0)
	if Duel.Destroy(tc,REASON_EFFECT)~=0 and atk>0 then
		Duel.Damage(tp,atk,REASON_EFFECT,true)
		Duel.Damage(1-tp,atk,REASON_EFFECT,true)
		Duel.RDComplete()
	end
end
`,
  },
};

/** Apply the overrides to a bundle's scripts and card rows. */
export function applyOverrides(bundle: { cards: { id: string; desc: string }[]; scripts: Record<string, string> }) {
  for (const [code, { script, text }] of Object.entries(OVERRIDES)) {
    bundle.scripts[`c${code}.lua`] = script;
    const row = bundle.cards.find((card) => card.id === code);
    if (row) row.desc = text;
  }
}
