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
  // Errata: once per turn, and a delayed effect banishes 1 "Sinister Serpent" from the GY during the opponent's next
  // End Phase (a Serpent back in the GY by then is banished, which looks random). 2004: it just returns to the hand.
  8131171: {
    text: 'During your Standby Phase, if this card is in your Graveyard, you can return it to your hand.',
    script: `--Sinister Serpent (2004 text)
local s,id=GetID()
function s.initial_effect(c)
	local e1=Effect.CreateEffect(c)
	e1:SetDescription(aux.Stringid(id,0))
	e1:SetCategory(CATEGORY_TOHAND)
	e1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_O)
	e1:SetCode(EVENT_PHASE|PHASE_STANDBY)
	e1:SetRange(LOCATION_GRAVE)
	e1:SetCountLimit(1)
	e1:SetCondition(function(_,tp) return Duel.IsTurnPlayer(tp) end)
	e1:SetTarget(s.target)
	e1:SetOperation(s.operation)
	c:RegisterEffect(e1)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
	local c=e:GetHandler()
	if chk==0 then return c:IsAbleToHand() end
	Duel.SetOperationInfo(0,CATEGORY_TOHAND,c,1,tp,0)
end
function s.operation(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	if c:IsRelateToEffect(e) then
		Duel.SendtoHand(c,nil,REASON_EFFECT)
	end
end
`,
  },
  // Errata: nothing on activation; the materials go to the Graveyard on the 1st Standby Phase, the summon on the 2nd.
  // Original text: the materials go to the Graveyard when the card resolves, the summon comes on the 2nd Standby Phase.
  77565204: {
    text: 'Send, from your Deck to the Graveyard, Fusion Material Monsters that are listed on a Fusion Monster Card, and select that 1 Fusion Monster from your Fusion Deck. Special Summon the selected Fusion Monster during your 2nd Standby Phase after this card\'s activation. (This Special Summon is treated as a Fusion Summon.) When this card is removed from the field, destroy that monster. When the monster is destroyed, destroy this card.',
    script: `--Future Fusion (original text)
local s,id=GetID()
function s.initial_effect(c)
	--Activate: send the materials now, remember the Fusion Monster
	local e1=Effect.CreateEffect(c)
	e1:SetCategory(CATEGORY_TOGRAVE)
	e1:SetType(EFFECT_TYPE_ACTIVATE)
	e1:SetCode(EVENT_FREE_CHAIN)
	e1:SetCost(s.reg)
	e1:SetTarget(s.target)
	e1:SetOperation(s.activate)
	c:RegisterEffect(e1)
	--2nd Standby Phase: Special Summon it (a Fusion Summon)
	local e2=Effect.CreateEffect(c)
	e2:SetCategory(CATEGORY_SPECIAL_SUMMON+CATEGORY_FUSION_SUMMON)
	e2:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_F)
	e2:SetRange(LOCATION_SZONE)
	e2:SetCode(EVENT_PHASE|PHASE_STANDBY)
	e2:SetCountLimit(1)
	e2:SetCondition(s.proccon)
	e2:SetOperation(s.procop)
	e2:SetLabelObject(e1)
	c:RegisterEffect(e2)
	--This card leaves the field: destroy that monster
	local e3=Effect.CreateEffect(c)
	e3:SetType(EFFECT_TYPE_CONTINUOUS+EFFECT_TYPE_SINGLE)
	e3:SetCode(EVENT_LEAVE_FIELD)
	e3:SetOperation(s.desop)
	c:RegisterEffect(e3)
	--That monster is destroyed: destroy this card
	local e4=Effect.CreateEffect(c)
	e4:SetType(EFFECT_TYPE_CONTINUOUS+EFFECT_TYPE_FIELD)
	e4:SetRange(LOCATION_SZONE)
	e4:SetCode(EVENT_LEAVE_FIELD)
	e4:SetCondition(s.descon2)
	e4:SetOperation(s.desop2)
	c:RegisterEffect(e4)
end
--count your Standby Phases from activation
function s.reg(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then return true end
	local c=e:GetHandler()
	c:SetTurnCounter(0)
	local e1=Effect.CreateEffect(c)
	e1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_CONTINUOUS)
	e1:SetCode(EVENT_PHASE_START|PHASE_STANDBY)
	e1:SetCountLimit(1)
	e1:SetOperation(s.ctop)
	Duel.RegisterEffect(e1,tp)
	c:CreateEffectRelation(e1)
end
function s.ctop(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	local ct=c:GetTurnCounter()
	if not c:IsRelateToEffect(e) or ct>=2 then
		c:SetTurnCounter(0)
		e:Reset()
		return
	end
	if Duel.IsTurnPlayer(1-tp) then return end
	c:SetTurnCounter(ct+1)
end
function s.filter1(c,e)
	return c:IsMonster() and c:IsAbleToGrave() and not c:IsImmuneToEffect(e)
end
function s.filter2(c,m)
	return c:IsFusionSummonableCard() and c:CheckFusionMaterial(m)
end
function s.target(e,tp,eg,ep,ev,re,r,rp,chk)
	if chk==0 then
		local mg=Duel.GetMatchingGroup(s.filter1,tp,LOCATION_DECK,0,nil,e)
		return Duel.IsExistingMatchingCard(s.filter2,tp,LOCATION_EXTRA,0,1,nil,mg)
	end
	Duel.SetOperationInfo(0,CATEGORY_TOGRAVE,nil,1,tp,LOCATION_DECK)
end
function s.activate(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	e:SetLabel(0)
	e:SetLabelObject(nil)
	if not c:IsRelateToEffect(e) then return end
	local mg=Duel.GetMatchingGroup(s.filter1,tp,LOCATION_DECK,0,nil,e)
	local sg=Duel.GetMatchingGroup(s.filter2,tp,LOCATION_EXTRA,0,nil,mg)
	if #sg==0 then return end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_CONFIRM)
	local tc=sg:Select(tp,1,1,nil):GetFirst()
	local mat=Duel.SelectFusionMaterial(tp,tc,mg)
	mat:KeepAlive()
	Duel.SendtoGrave(mat,REASON_EFFECT)
	for mc in aux.Next(mat) do
		mc:RegisterFlagEffect(id,RESET_EVENT|RESETS_STANDARD,0,1)
	end
	e:SetLabel(tc:GetCode())
	e:SetLabelObject(mat)
end
function s.proccon(e,tp,eg,ep,ev,re,r,rp)
	return Duel.IsTurnPlayer(tp) and e:GetHandler():GetTurnCounter()==2
end
function s.procfilter(c,code,e,tp)
	return c:IsCode(code) and Duel.GetLocationCountFromEx(tp,tp,nil,c)>0 and c:IsCanBeSpecialSummoned(e,SUMMON_TYPE_FUSION,tp,false,false)
end
function s.procop(e,tp,eg,ep,ev,re,r,rp)
	local c=e:GetHandler()
	if not c:IsRelateToEffect(e) then return end
	local code=e:GetLabelObject():GetLabel()
	local mat=e:GetLabelObject():GetLabelObject()
	if code==0 or not mat then return end
	Duel.Hint(HINT_SELECTMSG,tp,HINTMSG_SPSUMMON)
	local tc=Duel.SelectMatchingCard(tp,s.procfilter,tp,LOCATION_EXTRA,0,1,1,nil,code,e,tp):GetFirst()
	if not tc then return end
	tc:SetStatus(STATUS_FUTURE_FUSION,true)
	for mc in aux.Next(mat) do
		if mc:GetFlagEffect(id)>0 then
			mc:SetReason(REASON_EFFECT+REASON_FUSION+REASON_MATERIAL)
		end
	end
	tc:SetMaterial(mat)
	Duel.SpecialSummon(tc,SUMMON_TYPE_FUSION,tp,tp,false,false,POS_FACEUP)
	tc:CompleteProcedure()
	tc:SetStatus(STATUS_FUTURE_FUSION,false)
	c:SetCardTarget(tc)
end
function s.desop(e,tp,eg,ep,ev,re,r,rp)
	local tc=e:GetHandler():GetFirstCardTarget()
	if tc and tc:IsLocation(LOCATION_MZONE) then
		Duel.Destroy(tc,REASON_EFFECT)
	end
end
function s.descon2(e,tp,eg,ep,ev,re,r,rp)
	local tc=e:GetHandler():GetFirstCardTarget()
	return tc and eg:IsContains(tc) and tc:IsReason(REASON_DESTROY)
end
function s.desop2(e,tp,eg,ep,ev,re,r,rp)
	Duel.Destroy(e:GetHandler(),REASON_EFFECT)
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
