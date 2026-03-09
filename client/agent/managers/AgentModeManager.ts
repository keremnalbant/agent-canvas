import { Atom, atom } from 'tldraw'
import { getModeNode } from '../../modes/AgentModeChart'
import { AgentModeType, getAgentModeDefinition } from '../../modes/AgentModeDefinitions'
import type { TldrawAgent } from '../TldrawAgent'
import { BaseAgentManager } from './BaseAgentManager'

/**
 * Manages the mode/state of an agent.
 * The mode determines what prompt parts and actions are available.
 */
export class AgentModeManager extends BaseAgentManager {
	/**
	 * An atom containing the current agent mode.
	 */
	private $mode: Atom<AgentModeType>

	/**
	 * An atom tracking whether the agent has signaled plan completion.
	 */
	private $planComplete: Atom<boolean>

	/**
	 * Whether the user wants to enter planning mode on the next prompt.
	 * Used when user toggles plan mode while the agent is idling.
	 */
	private $pendingPlanMode: Atom<boolean>

	/**
	 * Creates a new mode manager for the given agent.
	 * Initializes the mode to 'idling'.
	 */
	constructor(agent: TldrawAgent) {
		super(agent)
		this.$mode = atom('mode', 'idling')
		this.$planComplete = atom('planComplete', false)
		this.$pendingPlanMode = atom('pendingPlanMode', false)
	}

	/**
	 * Resets the mode manager to its initial state.
	 * Sets the mode to 'idling'.
	 */
	reset(): void {
		this.$mode.set('idling')
		this.$planComplete.set(false)
		this.$pendingPlanMode.set(false)
	}

	/**
	 * Set pending plan mode flag (for toggling while idle).
	 */
	setPendingPlanMode(value: boolean) {
		this.$pendingPlanMode.set(value)
	}

	/**
	 * Get pending plan mode flag.
	 */
	getPendingPlanMode(): boolean {
		return this.$pendingPlanMode.get()
	}

	/**
	 * Get whether the plan is complete.
	 */
	getPlanComplete(): boolean {
		return this.$planComplete.get()
	}

	/**
	 * Set whether the plan is complete.
	 */
	setPlanComplete(value: boolean) {
		this.$planComplete.set(value)
	}

	/**
	 * Get the current mode of the agent.
	 * @returns The current mode type.
	 */
	getCurrentModeType(): AgentModeType {
		return this.$mode.get()
	}

	/**
	 * Set the mode of the agent.
	 * Calls onExit for the current mode and onEnter for the new mode.
	 * Also rebuilds action utils to use mode-specific implementations.
	 * @param newMode - The mode to set.
	 */
	setMode(newMode: AgentModeType) {
		const fromMode = this.getCurrentModeType()

		// TODO see if this is needed, or if it should just be a return, or if we can remove it entirely
		if (fromMode === newMode) {
			throw new Error(`Agent is already in mode: ${newMode}`)
		}

		const fromModeNode = this.getCurrentModeNode()
		const newModeNode = getModeNode(newMode)
		fromModeNode.onExit?.(this.agent, newMode)
		newModeNode.onEnter?.(this.agent, fromMode)

		// Update the mode
		this.$mode.set(newMode)

		// Rebuild action utils for the new mode
		this.agent.actions.rebuildUtilsForMode(newMode)
	}

	/**
	 * Get the mode definition for the current mode.
	 * @returns The mode definition containing parts and actions.
	 */
	getCurrentModeDefinition() {
		return getAgentModeDefinition(this.getCurrentModeType())
	}

	/**
	 * Get current mode node.
	 * @returns The current mode node.
	 */
	getCurrentModeNode() {
		return getModeNode(this.getCurrentModeType())
	}
}
