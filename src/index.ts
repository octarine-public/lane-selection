import "./translations"

import {
	DOTA_CHAT_MESSAGE,
	EventsSDK,
	GameState,
	LaneSelection,
	LaneSelectionFlags,
	LocalPlayer,
	Player,
	PlayerCustomData,
	Sleeper,
	SOType,
	Team,
	UnitData
} from "github.com/octarine-public/wrapper/index"

import { ELane, ETeam } from "./enum"
import { MenuManager } from "./menu"

const bootstrap = new (class CLaneSelection {
	private setPosition = false
	private readonly sleeper = new Sleeper()
	private readonly additionalDelay = 1 * 1000
	private readonly cacheHeroNames = new Set<string>()
	private readonly heroesDisallowed = new Set<number>()
	private readonly menu = new MenuManager(this.sleeper)
	private readonly laneSelections = new Map<bigint, Nullable<LaneSelectionFlags>>()

	constructor() {
		this.menu.SelecteLane.OnValue(() => (this.setPosition = false))
		this.menu.BasedFromRole.OnValue(() => (this.setPosition = false))
	}

	protected get Delay() {
		const ping = GameState.Ping,
			delay = this.additionalDelay
		return this.mtRand(delay / 2 + ping, delay + ping)
	}

	public PostDataUpdate() {
		if (!GameState.IsConnected || !this.menu.State.value) {
			return
		}
		if (LocalPlayer !== undefined && !LocalPlayer.IsSpectator) {
			this.UpdatePossibleHero()
			this.UpdateMarker(LocalPlayer)
		}
	}

	public GameEnded() {
		this.setPosition = false
		this.sleeper.FullReset()
		this.laneSelections.clear()
		this.cacheHeroNames.clear()
		this.heroesDisallowed.clear()
	}

	public UnitAbilityDataUpdated() {
		this.menu.UnitAbilityDataUpdated()
	}

	public OnChatEvent(type: DOTA_CHAT_MESSAGE, heroID: number) {
		if (this.heroesDisallowed.has(heroID)) {
			return
		}
		switch (type) {
			case DOTA_CHAT_MESSAGE.CHAT_MESSAGE_HERO_BANNED:
			case DOTA_CHAT_MESSAGE.CHAT_MESSAGE_HERO_CHOICE_INVALID:
				this.heroesDisallowed.add(heroID)
				break
		}
	}

	public SharedObjectChanged(id: SOType, reason: number, obj: RecursiveMap) {
		if (id !== SOType.Lobby) {
			return
		}
		if (reason === 2) {
			this.GameEnded()
		}
		if (reason !== 0) {
			return
		}
		const members = this.getMembers(obj)
		if (members.length > 10) {
			return
		}
		for (let index = members.length - 1; index > -1; index--) {
			const member = members[index],
				steamID = member.get("id") as bigint,
				laneSelectionFlags = member.get("lane_selection_flags")
			if (steamID === undefined) {
				continue
			}
			this.laneSelections.set(
				steamID,
				laneSelectionFlags as Nullable<LaneSelectionFlags>
			)
		}
	}

	protected UpdatePossibleHero() {
		const playerData = PlayerCustomData.Array.find(x => x.IsLocalPlayer)
		const possibleHero = playerData?.DataTeamPlayer?.PossibleHeroSelection ?? 0
		if (possibleHero !== 0) {
			return
		}
		const getName = this.GetReplacedHeroName()
		if (getName === undefined || this.sleeper.Sleeping("possibleHero")) {
			return
		}
		this.cacheHeroNames.add(getName)
		this.sleeper.Sleep(this.Delay, "possibleHero")
		GameState.ExecuteCommand(`possible_hero ${getName}`)
	}

	protected UpdateMarker(player: Player) {
		const steamID = player.SteamID
		if (steamID === undefined) {
			return
		}
		const laneSelectionFlags = this.laneSelections.get(steamID)
		this.setLane(player.Team, laneSelectionFlags)
	}

	protected GetReplacedHeroName(): Nullable<string> {
		for (let index = this.menu.HeroNames.length - 1; index > -1; index--) {
			const heroName = this.menu.HeroNames[index]
			if (this.cacheHeroNames.has(heroName)) {
				continue
			}
			if (!this.menu.HeroSelected.IsEnabled(heroName)) {
				continue
			}
			const heroId = UnitData.GetHeroID(heroName)
			if (!this.heroesDisallowed.has(heroId)) {
				return heroName.replace("npc_dota_hero_", "")
			}
		}
	}

	private getMembers(obj: RecursiveMap) {
		return (obj.get("all_members") as RecursiveMap[]).filter(
			x =>
				x.has("id") &&
				(x.get("team") === ETeam.Dire || x.get("team") === ETeam.Radiant)
		)
	}

	private setLane(team: Team, laneSelectionFlags?: LaneSelectionFlags) {
		const menu = this.menu,
			isBasedFromRole = menu.BasedFromRole.value,
			laneSelectionMenu = menu.SelecteLane.SelectedID

		const laneSelection = isBasedFromRole
			? laneSelectionFlags?.toMask[0] ?? laneSelectionMenu
			: laneSelectionMenu

		this.executeCommand(team, laneSelection)
	}

	private getELane(team: Team, lane: LaneSelection): ELane {
		const isDire = team === Team.Dire
		switch (lane) {
			case LaneSelection.MID_LANE:
				return ELane.Mid
			case LaneSelection.SAFE_LANE:
			case LaneSelection.HARD_SUPPORT:
				return isDire ? ELane.Hard : ELane.Easy
			case LaneSelection.OFF_LANE:
				return isDire ? ELane.Easy : ELane.Hard
			case LaneSelection.SUPPORT:
				return isDire ? ELane.RadiantJungle : ELane.DireJungle
			default:
				return ELane.None
		}
	}

	private mtRand(min: number, max: number): number {
		return Math.floor(Math.random() * (max - min + 1)) + min
	}

	private executeCommand(team: Team, laneSelections: LaneSelection) {
		if (this.setPosition) {
			return
		}
		const position = this.getELane(team, laneSelections)
		// console.log(`Position: ${position} Lane: ${laneSelections} Team: ${team}`)
		GameState.ExecuteCommand(`dota_select_starting_position ${position}`)
		this.setPosition = true
	}
})()

EventsSDK.on("GameEnded", () => bootstrap.GameEnded())

EventsSDK.on("PostDataUpdate", () => bootstrap.PostDataUpdate())

EventsSDK.on("ChatEvent", (type, value) => bootstrap.OnChatEvent(type, value))

EventsSDK.on("SharedObjectChanged", (id, reason, obj) =>
	bootstrap.SharedObjectChanged(id, reason, obj)
)
