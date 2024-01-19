import {
	ImageData,
	Menu,
	NotificationsSDK,
	ResetSettingsUpdated,
	Sleeper,
	UnitData
} from "github.com/octarine-public/wrapper/index"

import { ELanePicker } from "./enum"

export class MenuManager {
	public HeroNames: string[] = []
	public readonly State: Menu.Toggle
	public readonly SelecteLane: Menu.Dropdown
	public readonly HeroSelected: Menu.ImageSelector

	private readonly tree: Menu.Node
	private readonly heroAttribute: Menu.Dropdown

	private readonly baseNode = Menu.AddEntry("Utility")
	private readonly attrNames = ["Strength", "Agility", "Intellect", "Universal"]
	private readonly laneNames = [
		"Hard lane",
		"Mid lane",
		"Easy lane",
		"Jungle",
		"Enemy jungle"
	]

	constructor(private readonly sleeper: Sleeper) {
		this.tree = this.baseNode.AddNode(
			"Auto Lane selection",
			ImageData.Paths.Icons.magic_resist
		)
		this.State = this.tree.AddToggle("State")
		this.SelecteLane = this.tree.AddDropdown(
			"Select lane",
			this.laneNames,
			ELanePicker.MID
		)
		this.heroAttribute = this.tree.AddDropdown(
			"Primary attribute hero",
			this.attrNames
		)
		this.HeroSelected = this.tree.AddImageSelector("Heroes", [])
		this.heroAttribute.OnValue(call =>
			this.UpdateHeroSelectedNodes(call, this.HeroSelected)
		)
		this.tree
			.AddButton("Reset settings", "Reset settings to default")
			.OnValue(() => this.ResetSettings())
	}

	public UnitAbilityDataUpdated() {
		this.HeroNames = Array.from(UnitData.globalStorage.entries())
			.filter(([name, data]) => this.IsValidName(name, data))
			.map(([name]) => name)
	}

	protected ResetSettings() {
		if (!this.sleeper.Sleeping("ResetSettings")) {
			this.State.value = this.State.defaultValue
			this.SelecteLane.SelectedID = this.SelecteLane.defaultValue
			this.heroAttribute.SelectedID = this.heroAttribute.defaultValue
			NotificationsSDK.Push(new ResetSettingsUpdated())
			this.sleeper.Sleep(2 * 1000, "ResetSettings")
		}
	}

	protected UpdateHeroSelectedNodes(
		attribute: Menu.Dropdown,
		imageSelector: Menu.ImageSelector
	) {
		const entries = Array.from(UnitData.globalStorage.entries())

		this.HeroNames = entries
			.filter(([name, data]) => this.IsValidName(name, data))
			.map(([name]) => name)

		const heroes = entries
			.filter(
				([name, data]) =>
					this.IsValidName(name, data) &&
					data.AttributePrimary === attribute.SelectedID
			)
			.map(([name]) => name)
			.sort((a, b) => a.localeCompare(b))

		imageSelector.values = heroes
		imageSelector.Update()
		this.tree.Update()
	}

	protected IsValidName(name: string, data: UnitData) {
		return (
			data.HeroID !== 0 &&
			name !== "npc_dota_hero_base" &&
			name !== "npc_dota_hero_target_dummy" &&
			name.startsWith("npc_dota_hero_")
		)
	}
}
