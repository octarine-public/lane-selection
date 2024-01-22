import "./translations"

import {
	DOTA_CHAT_MESSAGE,
	EventsSDK,
	GameState,
	LocalPlayer,
	PlayerCustomData,
	Sleeper,
	Team,
	UnitData
} from "github.com/octarine-public/wrapper/index"

import { ELanePicker } from "./enum"
import { MenuManager } from "./menu"

const bootstrap = new (class CLaneSelection {
	private setPosition = false
	private readonly sleeper = new Sleeper()
	private readonly additionalDelay = 1 * 1000
	private readonly cacheHeroNames = new Set<string>()
	private readonly heroesDisallowed = new Set<number>()
	private readonly menu = new MenuManager(this.sleeper)

	protected get Delay() {
		const ping = GameState.Ping,
			delay = this.additionalDelay
		return this.mtRand(delay / 2 + ping, delay + ping)
	}

	public PostDataUpdate() {
		if (
			!GameState.IsConnected ||
			!this.menu.State.value ||
			LocalPlayer?.IsSpectator
		) {
			return
		}

		const possibleHeroID =
			PlayerCustomData.Array.find(x => x.IsLocalPlayer)?.DataTeamPlayer
				?.PossibleHeroSelection ?? 0

		this.UpdateMarkerToMapPosition()

		if (possibleHeroID !== 0) {
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

	public GameChanged() {
		this.setPosition = false
		this.sleeper.FullReset()
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

	protected UpdateMarkerToMapPosition() {
		if (this.setPosition) {
			return
		}
		let positionId = this.menu.SelecteLane.SelectedID + 1
		const localTeam = GameState.LocalTeam
		switch (positionId) {
			case ELanePicker.EASY:
				positionId = localTeam !== Team.Dire ? ELanePicker.EASY : ELanePicker.HARD
				break
			case ELanePicker.HARD:
				positionId = localTeam !== Team.Dire ? ELanePicker.HARD : ELanePicker.EASY
				break
			case ELanePicker.JUNGLE:
				positionId =
					localTeam !== Team.Dire
						? ELanePicker.JUNGLE
						: ELanePicker.JUNGLE_ENEMY
				break
			case ELanePicker.JUNGLE_ENEMY:
				positionId =
					localTeam !== Team.Dire
						? ELanePicker.JUNGLE_ENEMY
						: ELanePicker.JUNGLE
				break
		}
		this.setPosition = true
		GameState.ExecuteCommand("dota_select_starting_position " + positionId)
	}

	private mtRand(min: number, max: number): number {
		return Math.floor(Math.random() * (max - min + 1)) + min
	}
})()

EventsSDK.on("GameEnded", () => bootstrap.GameChanged())

EventsSDK.on("GameStarted", () => bootstrap.GameChanged())

EventsSDK.on("PostDataUpdate", () => bootstrap.PostDataUpdate())

EventsSDK.on("ChatEvent", (type, value) => bootstrap.OnChatEvent(type, value))
