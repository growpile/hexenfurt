// Central UI controller: view transitions and the helpers behind them (scale,
// follow, spotlight, text, buttons), the main menu, loading screen, story intro,
// the radial pinch-hold, the post-game flow, and first-game lore/archive button
// gating. GameFlow holds a reference and drives it through methods like
// transitionTo(), updateLoadProgress(), and doorOpened().

const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const sikModule = require("SpectaclesInteractionKit.lspkg/SIK");
const SIK = sikModule.SIK || sikModule.default || sikModule;
const InteractorTriggerType = require("SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor").InteractorTriggerType;
const CapsuleButtonModule = require("SpectaclesUIKit.lspkg/Scripts/Components/Button/CapsuleButton");
const CAPSULE_BUTTON_TYPE_NAME: string = CapsuleButtonModule.CapsuleButton.getTypeName();
const CapsuleButtonParametersModule = require("SpectaclesUIKit.lspkg/Scripts/Themes/SnapOS-2.0/Styles/CapsuleButtonParameters");
const CapsuleButtonParameters: Record<string, object> = CapsuleButtonParametersModule.CapsuleButtonParameters;

/** Stable string keys for the views known to the controller. Add new entries
 *  here when adding a new view (and a matching inspector slot in `views`). */
export type ViewId =
    | "newScanView"
    | "setupView"
    | "loadingView"
    | "postGameView";

type MainMenuButtonId = "play" | "archive" | "lore";

interface MainMenuInteractableApi {
    onHoverEnter: { add(cb: () => void): void };
    onHoverExit: { add(cb: () => void): void };
    onTriggerStart: { add(cb: () => void): void };
    enabled: boolean;
}

interface MainMenuButtonAnimTarget {
    id: MainMenuButtonId;
    transform: Transform;
    restPosition: vec3;
    fanPosition: vec3;
    fanEulerZDeg: number;
    hoverChase: number;
    isHovered: boolean;
}

interface MainMenuScaleTarget {
    transform: Transform;
    targetScale: vec3;
}

interface RegisteredView {
    root: SceneObject;
    transform: Transform;
    frameScript: ScriptComponent | null;
    animations: ViewAnimation[];
}

interface ViewAnimation {
    id: string;
    control: number;
    updateEvent: SceneEvent;
    cleanup?: () => void;
}

interface GameFlowAdapter {
    cleanWQM(): void;
    nextPhase(): void;
    setupProceduralGame(): void;
    simulatorSetup(): void;
    isUsingEditorSetup: boolean;
    roomAlreadyScanned: boolean;
    poiRoot: SceneObject;
    currentPhase: number;
    returnNextPhaseView(): string;
    checkCurrentPhaseData(callbackIfHas?: () => void): boolean;
    recordTap(): void;
    enableInteractors(state: boolean): void;
    worldQueryManager: ScriptComponent;
}

interface WorldQueryAnchorsHint {
    checkAnchorsNeeded(): string;
}

interface LoreGalleryApi {
    show(): void;
    hide(): void;
    nextItem(): void;
    prevItem(): void;
}

interface ArchiveGalleryApi {
    showCompendium(): void;
    hideCompendium(): void;
    archiveNext(): void;
    archivePrev(): void;
}

interface SettingsManagerApi {
    refreshFromStorage(): void;
}

interface SettingsCapsuleButtonApi {
    _style: string;
    _theme: string;
    _size: vec3;
    _initialized?: boolean;
    style?: string;
    stateName?: string;
    inactive?: boolean;
    visual?: SettingsButtonVisualApi;
    setState?: (stateName: string) => void;
    onTriggerEnd?: { add: (fn: () => void) => void };
}

interface SettingsButtonVisualApi {
    visualArgs?: { style?: { visualElementType: string; style: string; theme: string } };
    applyStyleParameters?: (parameters: object) => void;
    updateVisualStates?: () => void;
    _updateScaleCancelSet?: { cancel: () => void };
    _updatePositionCancelSet?: { cancel: () => void };
    _colorChangeCancelSet?: { cancel: () => void };
    transform?: Transform;
    _currentScale?: vec3;
    _currentPosition?: vec3;
}

@component
export class ViewController extends BaseScriptComponent {
    @ui.group_start("<span style='color: #60A5FA;'>Core</span>")
    @input
    @hint("GameFlow component. Used for phase transitions and game state queries.")
    public gameFlow!: ScriptComponent;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>View Transitions</span>")
    @input("int", "0")
    @widget(
        new ComboBoxWidget([
            new ComboBoxItem("Scale", 0),
            new ComboBoxItem("None", 1),
        ])
    )
    @hint("How transitions animate: Scale (default) or None.")
    public transitionStyle: number = 0;

    @input
    @hint("Default transition duration in seconds.")
    public defaultDuration: number = 0.2;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Main Menu View</span>")
    @input
    @hint("Hexenfurt logo shown with the main menu.")
    public hexenfurtLogo!: SceneObject;

    @input
    @label("View Root")
    @hint("Root object for the animated main menu (buttons + simulator child scale with this).")
    public mainMenuRoot!: SceneObject;

    @input
    @hint("Interactable on the Play button (parent SceneObject is the animated button mesh).")
    public playInteractable!: ScriptComponent;

    @input
    @hint("Interactable on the Lore button.")
    public loreInteractable!: ScriptComponent;

    @input
    @hint("Interactable on the Archive button.")
    public archiveInteractable!: ScriptComponent;

    @input
    @hint("Visual ring/glow on the Archive button when new lore was acquired.")
    public archiveHighlight!: SceneObject;

    @input
    @label("Lore Icon")
    @allowUndefined
    @hint("Image on the Lore button. Its mainMaterial '.state' is 0 when locked (no first game) and animates to 1 on unlock.")
    public loreIcon: Image | null = null;

    @input
    @label("Archive Icon")
    @allowUndefined
    @hint("Image on the Archive button. Its mainMaterial '.state' is 0 when locked (no first game) and animates to 1 on unlock.")
    public archiveIcon: Image | null = null;

    @input
    @label("Settings Button")
    @allowUndefined
    @hint("CapsuleButton on the main menu that opens settings (cards fold; logo stays).")
    public settingsButton: ScriptComponent | null = null;

    @input("float", "0.12")
    @hint("Fade duration when Settings button label swaps to Main Menu and back.")
    public settingsButtonLabelFadeDuration: number = 0.12;

    @input
    @label("Menu Particles VFX")
    @allowUndefined
    @hint("Burst when Play dismisses the main menu (folder fold-out). Uses burstDuration on the VFX asset.")
    public mainMenuParticlesVfx: VFXComponent | null = null;

    @input("float", "0.1")
    @hint("Burst window length in seconds (burstDuration = getTime() + this value).")
    public mainMenuParticleDuration: number = 0.1;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Settings View</span>")
    @input
    @label("Settings Root")
    @allowUndefined
    @hint("Panel scaled up over the main menu while menu cards are folded away.")
    public settingsRoot: SceneObject | null = null;

    @input
    @label("Settings Manager")
    @allowUndefined
    @hint("SettingsManager component for volume, gloves, and progress wipes.")
    public settingsManager: ScriptComponent | null = null;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Lore Gallery View</span>")
    @input
    @label("View Root")
    @hint("Root composite for the hanging-lore compendium.")
    public loreGalleryRoot!: SceneObject;

    @input
    @hint("LoreGallery component on this root or a child.")
    public loreGallery!: ScriptComponent;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Archive Gallery View</span>")
    @input
    @label("View Root")
    @hint("Root composite for the room-object archive.")
    public archiveGalleryRoot!: SceneObject;

    @input
    @hint("ArchiveGallery component on this root or a child.")
    public archiveGallery!: ScriptComponent;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Setup View</span>")
    @input
    @label("View Root")
    @hint("Root object for the Setup view (POI-anchor placement phase).")
    public setupViewRoot!: SceneObject;

    @input
    @label("UIKit Frame")
    @allowUndefined
    @hint("Optional UIKit frame script; its SceneObject is toggled instead of the root.")
    public setupViewFrame: ScriptComponent | null = null;

    @input
    @hint("Anchor placement summary during the POI-anchors setup phase.")
    public anchorsHint!: Text;

    @input
    public holdRadialMaterial!: Material;

    @input
    @hint("Total time (s) to fill the radial hold ring. 2s = default.")
    public totalHoldTime: number = 2.0;

    @input
    @hint("Pinch must remain down for this long (s) before progress starts filling.")
    public holdDelay: number = 0.3;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Setup Prompt View</span>")
    @input
    @label("View Root")
    @hint("Root object for the 'use existing scan / re-scan' prompt.")
    public setupPromptRoot!: SceneObject;

    @input
    @label("UIKit Frame")
    @allowUndefined
    @hint("Optional UIKit frame script; its SceneObject is toggled instead of the root.")
    public setupPromptFrame: ScriptComponent | null = null;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Loading View</span>")
    @input
    @label("View Root")
    @hint("Root object for the loading view shown while the procedural room spawns.")
    public loadingViewRoot!: SceneObject;

    @input
    @label("UIKit Frame")
    @allowUndefined
    @hint("Optional UIKit frame script; its SceneObject is toggled instead of the root.")
    public loadingViewFrame: ScriptComponent | null = null;

    @input
    public loadingBarMaterial!: Material;

    @input
    @hint("Tip line shown while the procedural room spawns.")
    public loadingTipText!: Text;

    @input
    @hint("Pool of tips; one is shown at random between spawn steps.")
    public loadingTips: string[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Story Intro View</span>")
    @input
    @label("Story Intro View")
    @allowUndefined
    @hint("Shown after the loading bar; fades intro copy in/out before gameplay begins.")
    public storyIntroView: SceneObject | null = null;

    @input
    @label("Intro Part 1")
    @widget(new TextAreaWidget())
    public introPart1: string =
        "Strange cases of disappearance have unsettled the once-peaceful town of Hexenfurt...";

    @input
    @label("Intro Part 2")
    @widget(new TextAreaWidget())
    public introPart2: string =
        "As the newly appointed detective, you enter the old manor to uncover the truth - but once inside, the door locks behind you.";

    @input
    @hint("Seconds each intro part stays fully visible between fade-in and fade-out.")
    public storyIntroHoldDuration: number = 2.0;

    @input
    @hint("Seconds to fade intro text in or out.")
    public storyIntroFadeDuration: number = 0.8;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Post-Game View</span>")
    @input
    @label("View Root")
    @hint("Root object for the post-game results view.")
    public postGameRoot!: SceneObject;

    @input
    @label("UIKit Frame")
    @allowUndefined
    @hint("Optional UIKit frame script; its SceneObject is toggled instead of the root.")
    public postGameFrame: ScriptComponent | null = null;

    @input
    public endingTimeText!: Text;

    @input
    public endingPbFlag!: SceneObject;

    @input
    @hint("Floating 'check the leaderboard' hint shown once after the first run.")
    public leaderboardHint!: SceneObject;
    @ui.group_end

    /** ID of the view currently displayed (main menu and galleries are separate). */
    public currentView: ViewId = "setupView";
    public canHold: boolean = false;

    private static readonly MENU_BTN_SCALE = new vec3(15, 15, 15);
    private static readonly MENU_HOVER_SCALE_MULT = 1.08;
    private static readonly MENU_SHOW_SCALE_DURATION = 0.55;
    private static readonly MENU_FAN_DURATION = 0.45;
    private static readonly MENU_EXIT_PARTICLE_SCALE = 0.5;
    private static readonly MENU_HIDE_DURATION = 0.4;
    private static readonly LEADERBOARD_HINT_SCALE_DURATION = 0.25;
    private static readonly LOGO_WIGGLE_DEG = 5;
    private static readonly LOGO_WIGGLE_PERIOD_SEC = 4;

    // Lore/Archive lock icons. `state` 0 = locked (greyed), 1 = unlocked.
    private static readonly ICON_LOCKED_STATE = 0;
    private static readonly ICON_UNLOCKED_STATE = 1;
    private static readonly ICON_STATE_TRANSITION_SEC = 0.45;
    private static readonly ICON_PULSE_SEC = 0.85;
    private static readonly ICON_PULSE_CYCLES = 2.5;
    private static readonly ICON_PULSE_PEAK_MULT = 1.2; // 0.5 -> 0.6 base scale
    private static readonly ICON_SHAKE_SEC = 0.4;
    private static readonly ICON_SHAKE_DEG = 8;
    private static readonly ICON_SHAKE_OSCILLATIONS = 3;

    private registry: { [id: string]: RegisteredView } = {};
    private activeAnimations: ViewAnimation[] = [];

    private chaseProgress: number = 0;
    private loadEvent!: SceneEvent;
    private pinchHoldEvent!: SceneEvent;
    private mainMenuHoverEvent!: SceneEvent;
    private mainMenuAnimEvent: SceneEvent | null = null;
    private mainMenuParticleBurstFired: boolean = false;

    private leaderboardHintAlreadyDisplayed: boolean = false;
    private lbHintActive: boolean = false;
    private leaderboardHintAnimEvent: SceneEvent | null = null;

    private holdArmed: boolean = false;
    private holdStart: number = 0;
    private waitForRelease: boolean = false;
    private radialProgress: number = 0;
    private initialized: boolean = false;

    private mainMenuActive: boolean = false;
    private mainMenuAnimating: boolean = false;
    private mainMenuInputReady: boolean = false;
    private mainMenuButtons: MainMenuButtonAnimTarget[] = [];
    private simulatorButtonTransform: Transform | null = null;
    private settingsButtonTransform: Transform | null = null;
    private firstGameUnlocked: boolean = false;
    private iconsRevealPending: boolean = false;
    private iconsPulseOnReveal: boolean = false;
    private iconsCaptured: boolean = false;
    private loreIconTransform: Transform | null = null;
    private archiveIconTransform: Transform | null = null;
    private loreIconBaseScale: vec3 = new vec3(0.5, 0.5, 0.5);
    private archiveIconBaseScale: vec3 = new vec3(0.5, 0.5, 0.5);
    private loreIconBaseRotation: quat = quat.quatIdentity();
    private archiveIconBaseRotation: quat = quat.quatIdentity();
    private iconStateValue: number = ViewController.ICON_LOCKED_STATE;
    private iconStateAnimEvent: SceneEvent | null = null;
    private iconPulseEvent: SceneEvent | null = null;
    private loreIconShakeEvent: SceneEvent | null = null;
    private archiveIconShakeEvent: SceneEvent | null = null;
    private mainMenuInteractablesBound: boolean = false;
    private logoBaseScale: vec3 = new vec3(1, 1, 1);
    private logoBaseLocalRotation: quat = quat.quatIdentity();
    private logoWiggleEvent: SceneEvent | null = null;
    private logoWiggleStartTime: number = 0;
    private galleryScaleEvent: SceneEvent | null = null;
    private settingsActive: boolean = false;
    private settingsButtonRestStyle: string = "PrimaryNeutral";
    private settingsButtonClosedLabel: string = "Settings";
    private settingsButtonLabelText: Text | null = null;
    private settingsButtonLabelTween: any = null;
    private settingsButtonUiOpen: boolean = false;
    private settingsPanelBusy: boolean = false;
    private settingsButtonRestPosition: vec3 | null = null;
    private settingsButtonRestScale: vec3 | null = null;
    private settingsButtonRestRotation: quat | null = null;
    private pendingGameplayStart: (() => void) | null = null;
    private loadingBarDismissed: boolean = false;
    private storyIntroActive: boolean = false;
    private storyIntroAnimTween: any = null;
    private static readonly STORY_INTRO_SCALE_START = 0.5;
    /** Scale progress rate vs timeline (0.05 = 10% of prior half-speed rate). */
    private static readonly STORY_INTRO_SCALE_SPEED = 0.35;
    private static readonly SETTINGS_BUTTON_ACTIVE_STYLE = "Special";
    private static readonly SETTINGS_BUTTON_THEME = "SnapOS2";
    private static readonly SETTINGS_BUTTON_OPEN_LABEL = "Main Menu";

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.onStart());
    }

    private initialize(): void {
        if (this.initialized) return;
        this.initialized = true;

        const viewDefs: { id: ViewId; root: SceneObject; frameScript: ScriptComponent | null }[] = [
            { id: "setupView", root: this.setupViewRoot, frameScript: this.setupViewFrame },
            { id: "newScanView", root: this.setupPromptRoot, frameScript: this.setupPromptFrame },
            { id: "loadingView", root: this.loadingViewRoot, frameScript: this.loadingViewFrame },
            { id: "postGameView", root: this.postGameRoot, frameScript: this.postGameFrame },
        ];
        for (let i = 0; i < viewDefs.length; i++) {
            const def = viewDefs[i];
            if (!def.root) continue;
            this.registry[def.id] = {
                root: def.root,
                transform: def.root.getTransform(),
                frameScript: def.frameScript,
                animations: [],
            };
        }

        global.hexenfurtSetupViewRoot = this.registry["setupView"]?.root ?? null;

        this.loadEvent = this.createEvent("UpdateEvent");
        this.loadEvent.enabled = false;
        this.loadEvent.bind(() => this.tickLoadProgress());

        this.pinchHoldEvent = this.createEvent("UpdateEvent");
        this.pinchHoldEvent.bind(() => this.tickPinchHold());

        this.mainMenuHoverEvent = this.createEvent("UpdateEvent");
        this.mainMenuHoverEvent.enabled = false;
        this.mainMenuHoverEvent.bind(() => this.tickMainMenuHover());

        this.buildMainMenuButtonTargets();
        this.captureLockIcons();
    }

    private onStart(): void {
        this.initialize();

        for (const id in this.registry) {
            if (this.transitionStyle === 0) {
                this.newWorldScale(id, new vec3(0, 0, 0), 1, () => {
                    this.toggleUIComposite(id, false);
                });
            } else {
                this.toggleUIComposite(id, false);
            }
        }

        this.prepareMainMenuHidden();
        this.prepareGalleriesHidden();
        this.prepareSettingsHidden();
        this.prepareStoryIntroHidden();
        this.prepareLeaderboardHintHidden();
        this.bindMainMenuInteractables();
    }

    // Public API: button-bound entry points

    public startTap(): void {
        if (this.lbHintActive) return;
        if (this.mainMenuActive) {
            this.dismissMainMenuAndRun(() => this.beginStartFlow(), true);
            return;
        }
        this.beginStartFlow();
    }

    private beginStartFlow(): void {
        global.utils.delay(0.25, () => {
            const gameFlow = this.gameFlow as unknown as GameFlowAdapter;
            if (gameFlow.roomAlreadyScanned) {
                this.transitionTo("newScanView");
            } else {
                this.transition(this.currentView, "setupView", this.defaultDuration, () => {
                    this.currentView = "setupView";
                    this.canHold = false;
                    gameFlow.nextPhase();
                });
            }
        });
    }

    public setupAgain(): void {
        const gameFlow = this.gameFlow as unknown as GameFlowAdapter;
        gameFlow.cleanWQM();
        gameFlow.roomAlreadyScanned = false;
        this.startTap();
    }

    public directPlay(): void {
        if (this.lbHintActive) return;
        if (this.mainMenuActive) {
            this.dismissMainMenuAndRun(() => this.beginDirectPlay());
            return;
        }
        this.beginDirectPlay();
    }

    public simulatorSetup(): void {
        if (this.lbHintActive) return;
        if (this.mainMenuActive) {
            this.dismissMainMenuAndRun(() => this.beginSimulatorSetup());
            return;
        }
        this.beginSimulatorSetup();
    }

    private beginDirectPlay(): void {
        const gameFlow = this.gameFlow as unknown as GameFlowAdapter;
        gameFlow.currentPhase = 4;
        this.proceedTap();
    }

    private beginSimulatorSetup(): void {
        const gameFlow = this.gameFlow as unknown as GameFlowAdapter;
        gameFlow.simulatorSetup();
    }

    /** WorldQueryManager has captured the required datum for the current phase. */
    public recordedData(): void {
        this.canHold = true;
    }

    /** Bridge from WorldQueryManager to GameFlow for manual snap. */
    public recordTap(): void {
        const gameFlow = this.gameFlow as unknown as GameFlowAdapter;
        gameFlow.recordTap();
    }

    /** Called when an anchor was destroyed. */
    public removedAnchor(): void {
        this.canHold = false;
    }

    /** Advance the phase machine; used by radial hold + simulator. */
    public proceedTap(): void {
        const gameFlow = this.gameFlow as unknown as GameFlowAdapter;

        if (!gameFlow.isUsingEditorSetup) {
            if (!gameFlow.checkCurrentPhaseData()) return;
        }

        const nextView = gameFlow.returnNextPhaseView();
        if (nextView === "gameView") {
            if (gameFlow.isUsingEditorSetup) {
                global.utils.delay(0.2, () => global.soundManager.playSound("doorSlam", 1));
                global.utils.delay(0.25, () => {
                    this.beginLoadingSession();
                    this.transition(this.currentView, "loadingView", this.defaultDuration, () => {
                        this.currentView = "loadingView";
                    });
                    gameFlow.setupProceduralGame();
                    gameFlow.nextPhase();
                });
            } else {
                this.beginLoadingSession();
                this.transition(this.currentView, "loadingView", this.defaultDuration, () => {
                    this.currentView = "loadingView";
                });
                gameFlow.setupProceduralGame();
                gameFlow.nextPhase();
                return;
            }
        }

        this.canHold = false;
        gameFlow.nextPhase();
    }

    public introDone(): void {
        this.showMainMenu();
    }

    /** Called by GameFlow's `global.doorOpened` when the player escapes. */
    public doorOpened(_escapeDoorObject: SceneObject, withTime: string, isPersonalBest: boolean): void {
        const gameFlow = this.gameFlow as unknown as GameFlowAdapter;
        let outroStarted = false;

        const beginObjectCleanup = (): void => {
            if (outroStarted) return;
            outroStarted = true;
            global.escapeDoorSlammed = undefined;

            global.soundManager.stopSpatialSoundById("fanLoop");
            global.soundManager.stopSpatialSoundById("fireLoop");
            global.soundManager.stopSpatialSoundById("clockTickLoop");

            this.scaleDownPoiChildrenThenClear(gameFlow.poiRoot, () => {
                this.showPostGameEnd(withTime, isPersonalBest);
                gameFlow.currentPhase = 0;
                global.inventory.reset();
            });
        };

        global.escapeDoorSlammed = () => {
            global.escapeDoorSlammed = undefined;
            global.utils.delay(0.5, beginObjectCleanup);
        };
        // Fallback if slam callback never fires (e.g. legacy door script).
        global.utils.delay(4, beginObjectCleanup);
    }

    private showPostGameEnd(withTime: string, isPersonalBest: boolean): void {
        this.endingPbFlag.enabled = isPersonalBest;
        this.endingTimeText.text = withTime + "s";
        this.transition(this.currentView, "postGameView", this.defaultDuration, () => {
            this.currentView = "postGameView";
        });
        this.enableMenuButton();
    }

    public enableMenuButton(): void {
        // No-op; the post-game menu button is enabled by the view transition.
    }

    // Alias for openLoreGallery.
    public openCompendium(): void {
        this.openLoreGallery();
    }

    /** Opens the hanging-lore gallery. */
    public openLoreGallery(): void {
        if (this.lbHintActive) return;
        if (!this.firstGameUnlocked) {
            if (this.mainMenuActive) this.shakeLockedIcon("lore");
            return;
        }
        if (this.mainMenuActive) {
            this.dismissMainMenuAndRun(() => this.beginOpenLoreGallery());
            return;
        }
        this.beginOpenLoreGallery();
    }

    /** Opens the room-object archive gallery. */
    public openArchiveGallery(): void {
        if (this.lbHintActive) return;
        if (!this.firstGameUnlocked) {
            if (this.mainMenuActive) this.shakeLockedIcon("archive");
            return;
        }
        if (this.mainMenuActive) {
            this.dismissMainMenuAndRun(() => this.beginOpenArchiveGallery());
            return;
        }
        this.beginOpenArchiveGallery();
    }

    private beginOpenLoreGallery(): void {
        this.hideArchiveGallery(() => {
            if (!this.loreGalleryRoot) return;
            this.loreGalleryRoot.enabled = true;
            (this.loreGallery as unknown as LoreGalleryApi).show?.();
            this.scaleGalleryRoot(this.loreGalleryRoot, true);
            global.soundManager.playSound("loreSlide", 1);
        });
    }

    private beginOpenArchiveGallery(): void {
        this.hideLoreGallery(() => {
            if (!this.archiveGalleryRoot) return;
            this.archiveGalleryRoot.enabled = true;
            (this.archiveGallery as unknown as ArchiveGalleryApi).showCompendium?.();
            this.scaleGalleryRoot(this.archiveGalleryRoot, true);
            global.soundManager.playSound("loreSlide", 1);
        });
    }

    /** Open settings if closed; close if already open (main-menu Settings button). */
    public toggleSettings(): void {
        if (this.lbHintActive) return;
        if (!this.mainMenuActive || this.mainMenuAnimating || this.settingsPanelBusy) return;
        if (this.settingsActive) {
            this.closeSettings();
            return;
        }
        this.openSettingsPanel();
    }

    public closeSettings(): void {
        if (!this.settingsActive || this.mainMenuAnimating || this.settingsPanelBusy) return;
        this.hideSettingsPanel();
    }

    public closeCompendium(): void {
        if (this.settingsActive) {
            this.closeSettings();
            return;
        }

        let pending = 0;
        const finish = (): void => {
            pending--;
            if (pending > 0) return;
            global.soundManager.playSound("loreSlide", 1);
            global.soundManager.playSound("choir", 1);
            this.returnToMainMenu();
        };

        if (this.loreGalleryRoot?.enabled) {
            pending++;
            this.hideLoreGallery(finish);
        }
        if (this.archiveGalleryRoot?.enabled) {
            pending++;
            this.hideArchiveGallery(finish);
        }
        if (pending === 0) {
            global.soundManager.playSound("loreSlide", 1);
            global.soundManager.playSound("choir", 1);
            this.returnToMainMenu();
        }
    }

    private prepareGalleriesHidden(): void {
        this.setGalleryRootHiddenImmediate(this.loreGalleryRoot);
        this.setGalleryRootHiddenImmediate(this.archiveGalleryRoot);
    }

    private prepareSettingsHidden(): void {
        this.settingsActive = false;
        this.settingsPanelBusy = false;
        this.stopSettingsButtonLabelTween();
        if (this.settingsButtonLabelText) {
            this.settingsButtonLabelText.text = this.settingsButtonClosedLabel;
            this.setSettingsButtonLabelAlpha(this.settingsButtonLabelText, 1);
        }
        this.setSettingsButtonMenuOpen(false, false, true);
        this.setSettingsButtonInteractableEnabled(false);
        this.resetSettingsButtonTransform();
        this.setGalleryRootHiddenImmediate(this.settingsRoot);
    }

    private setGalleryRootHiddenImmediate(root: SceneObject | null): void {
        if (!root) return;
        this.stopGalleryScaleAnim();
        root.getTransform().setWorldScale(new vec3(0, 0, 0));
        root.enabled = false;
    }

    private hideLoreGallery(onDone?: () => void): void {
        if (!this.loreGalleryRoot?.enabled) {
            if (onDone) onDone();
            return;
        }
        (this.loreGallery as unknown as LoreGalleryApi).hide?.();
        this.scaleGalleryRoot(this.loreGalleryRoot, false, () => {
            this.loreGalleryRoot.enabled = false;
            if (onDone) onDone();
        });
    }

    private hideArchiveGallery(onDone?: () => void): void {
        if (!this.archiveGalleryRoot?.enabled) {
            if (onDone) onDone();
            return;
        }
        (this.archiveGallery as unknown as ArchiveGalleryApi).hideCompendium?.();
        this.scaleGalleryRoot(this.archiveGalleryRoot, false, () => {
            this.archiveGalleryRoot.enabled = false;
            if (onDone) onDone();
        });
    }

    private scaleGalleryRoot(root: SceneObject | null, show: boolean, onDone?: () => void): void {
        if (!root) {
            if (onDone) onDone();
            return;
        }

        const target = show ? new vec3(1, 1, 1) : new vec3(0, 0, 0);
        if (this.transitionStyle === 1) {
            root.getTransform().setWorldScale(target);
            if (onDone) onDone();
            return;
        }

        if (show) {
            root.getTransform().setWorldScale(new vec3(0, 0, 0));
        }

        this.animateTransformWorldScale(root.getTransform(), target, this.defaultDuration, onDone);
    }

    private stopGalleryScaleAnim(): void {
        if (this.galleryScaleEvent) {
            this.galleryScaleEvent.enabled = false;
            this.removeEvent(this.galleryScaleEvent);
            this.galleryScaleEvent = null;
        }
    }

    private animateTransformWorldScale(
        transform: Transform,
        newScale: vec3,
        scaleSpeed: number,
        callback?: () => void
    ): void {
        this.stopGalleryScaleAnim();

        let control = 0;
        const ev = this.createEvent("UpdateEvent");
        this.galleryScaleEvent = ev;

        ev.bind(() => {
            control = (1 - scaleSpeed) * control + scaleSpeed * 1;
            const currentScale = transform.getWorldScale();
            transform.setWorldScale(vec3.lerp(currentScale, newScale, scaleSpeed));
            if (Math.abs(control - 1) < 0.01) {
                transform.setWorldScale(newScale);
                ev.enabled = false;
                this.removeEvent(ev);
                this.galleryScaleEvent = null;
                if (callback) callback();
            }
        });
    }

    /** Lore gallery scroll forward. */
    public loreNext(): void {
        (this.loreGallery as unknown as LoreGalleryApi).nextItem?.();
    }

    /** Lore gallery scroll back. */
    public lorePrev(): void {
        (this.loreGallery as unknown as LoreGalleryApi).prevItem?.();
    }

    /** Archive gallery scroll forward. */
    public archiveNext(): void {
        (this.archiveGallery as unknown as ArchiveGalleryApi).archiveNext?.();
    }

    /** Archive gallery scroll back. */
    public archivePrev(): void {
        (this.archiveGallery as unknown as ArchiveGalleryApi).archivePrev?.();
    }

    /** Called when the user dismisses the leaderboard hint. */
    public dismissLeaderboard(): void {
        if (!this.lbHintActive) return;
        this.lbHintActive = false;
        this.applyMainMenuInteractableGating();
        this.mainMenuHoverEvent.enabled = this.mainMenuInputReady && !this.mainMenuAnimating;
        this.hideLeaderboardHint(() => this.revealLockIconsNow());
    }

    public backToMenu(): void {
        if (!this.leaderboardHintAlreadyDisplayed) {
            this.lbHintActive = true;
            this.clearMainMenuHover();
            this.mainMenuHoverEvent.enabled = false;
            this.setMainMenuInteractablesEnabled(false);
            this.setSettingsButtonInteractableEnabled(false);
            this.showLeaderboardHint();
        }
        this.leaderboardHintAlreadyDisplayed = true;

        global.soundManager.playSound("choir", 1);
        this.returnToMainMenu();
    }

    /** Generic transition entry point (used by GameFlow). */
    public transitionTo(toId: ViewId, durationSec?: number, onDone?: () => void): void {
        const d = durationSec ?? this.defaultDuration;
        this.transition(this.currentView, toId, d, () => {
            this.currentView = toId;
            if (onDone) onDone();
        });
    }

    public updateLoadProgress(progress: number): void {
        this.loadEvent.enabled = true;
        this.chaseProgress = progress;
    }

    public onProceduralSpawnComplete(onGameplayReady: () => void): void {
        this.pendingGameplayStart = onGameplayReady;
        this.tryBeginStoryIntroOrGameplay();
    }

    /** Called by GameFlow after every game completion. The very first time it
     *  flips the lore/archive lock open, it queues a reveal + pulse for the next
     *  time the main menu appears (i.e. returning from that first game). */
    public unlockArchive(): void {
        if (this.firstGameUnlocked) return;
        this.firstGameUnlocked = true;
        this.iconsRevealPending = true;
        this.iconsPulseOnReveal = true;
    }

    /** Called by GameFlow on `OnStartEvent` if `hasPlayedFirstGame()` is true.
     *  A player who already played in a previous session enters with the buttons
     *  unlocked: the icons transition open (no pulse) when the menu first shows. */
    public refreshFirstGameState(played: boolean): void {
        if (!played || this.firstGameUnlocked) return;
        this.firstGameUnlocked = true;
        this.iconsRevealPending = true;
        this.iconsPulseOnReveal = false;
    }

    /** Called after local progress wipe: lore/archive menu buttons lock again and
     *  any open gallery is closed. Matches cleared `hasPlayedFirstGame` storage. */
    public lockLoreArchiveMenus(): void {
        this.firstGameUnlocked = false;
        this.iconsRevealPending = false;
        this.iconsPulseOnReveal = false;
        this.stopIconStateAnim();
        this.stopIconPulse();
        this.stopIconShake("lore");
        this.stopIconShake("archive");
        this.restoreIconRestTransforms();
        this.applyIconMaterialState(ViewController.ICON_LOCKED_STATE);

        if (this.loreGalleryRoot?.enabled || this.archiveGalleryRoot?.enabled) {
            this.closeCompendium();
        }
    }

    public updateAnchorRequirementsHint(): void {
        if (!this.anchorsHint) return;
        const gameFlow = this.gameFlow as unknown as GameFlowAdapter;
        const wqm = gameFlow.worldQueryManager as unknown as WorldQueryAnchorsHint;
        this.anchorsHint.text = wqm.checkAnchorsNeeded();
    }

    // View registry, transitions, and animations

    private getView(id: string): RegisteredView | null {
        return this.registry[id] ?? null;
    }

    private registerAnimation(viewId: string, animationData: ViewAnimation): void {
        const view = this.registry[viewId];
        if (!view) return;
        const prefix = animationData.id.split("_")[1];
        for (let i = view.animations.length - 1; i >= 0; i--) {
            const existing = view.animations[i];
            if (existing.id.indexOf(prefix) !== -1) {
                if (existing.updateEvent) {
                    existing.updateEvent.enabled = false;
                    this.removeEvent(existing.updateEvent);
                }
                view.animations.splice(i, 1);
            }
        }
        view.animations.push(animationData);
        this.activeAnimations.push(animationData);

        animationData.cleanup = () => {
            view.animations = view.animations.filter((a) => a !== animationData);
            this.activeAnimations = this.activeAnimations.filter((a) => a !== animationData);
        };
    }

    private newWorldScale(viewId: string, newScale: vec3, scaleSpeed: number, callback?: () => void): void {
        const view = this.getView(viewId);
        if (!view) return;
        const transform = view.transform;

        const animationData: ViewAnimation = {
            id: viewId + "_scale",
            control: 0,
            updateEvent: this.createEvent("UpdateEvent"),
        };
        this.registerAnimation(viewId, animationData);

        animationData.updateEvent.bind(() => {
            animationData.control = (1 - scaleSpeed) * animationData.control + scaleSpeed * 1;
            const currentScale = transform.getWorldScale();
            transform.setWorldScale(vec3.lerp(currentScale, newScale, scaleSpeed));
            if (Math.abs(animationData.control - 1) < 0.01) {
                transform.setWorldScale(newScale);
                if (callback) callback();
                animationData.updateEvent.enabled = false;
                animationData.cleanup?.();
                this.removeEvent(animationData.updateEvent);
            }
        });
    }

    private newWorldPosition(viewId: string, newPosition: vec3, translateSpeed: number, callback?: () => void): void {
        const view = this.getView(viewId);
        if (!view) return;
        const transform = view.transform;

        const animationData: ViewAnimation = {
            id: viewId + "_translation",
            control: 0,
            updateEvent: this.createEvent("UpdateEvent"),
        };
        this.registerAnimation(viewId, animationData);

        animationData.updateEvent.bind(() => {
            animationData.control = (1 - translateSpeed) * animationData.control + translateSpeed * 1;
            const currentPosition = transform.getWorldPosition();
            transform.setWorldPosition(vec3.lerp(currentPosition, newPosition, translateSpeed));
            if (Math.abs(animationData.control - 1) < 0.01) {
                transform.setWorldPosition(newPosition);
                if (callback) callback();
                animationData.updateEvent.enabled = false;
                animationData.cleanup?.();
                this.removeEvent(animationData.updateEvent);
            }
        });
    }

    private newWorldRotation(viewId: string, newRotation: quat, rotateSpeed: number, callback?: () => void): void {
        const view = this.getView(viewId);
        if (!view) return;
        const transform = view.transform;

        const animationData: ViewAnimation = {
            id: viewId + "_rotation",
            control: 0,
            updateEvent: this.createEvent("UpdateEvent"),
        };
        this.registerAnimation(viewId, animationData);

        animationData.updateEvent.bind(() => {
            animationData.control = (1 - rotateSpeed) * animationData.control + rotateSpeed * 1;
            const currentRotation = transform.getWorldRotation();
            transform.setWorldRotation(quat.slerp(currentRotation, newRotation, rotateSpeed));
            if (Math.abs(animationData.control - 1) < 0.01) {
                transform.setWorldRotation(newRotation);
                if (callback) callback();
                animationData.updateEvent.enabled = false;
                animationData.cleanup?.();
                this.removeEvent(animationData.updateEvent);
            }
        });
    }

    private toggleUIComposite(viewId: string, newState: boolean): void {
        const view = this.getView(viewId);
        if (!view) return;
        const frameSO = view.frameScript ? view.frameScript.getSceneObject() : null;
        (frameSO ?? view.root).enabled = newState;
    }

    private transition(fromId: string, toId: string, duration: number, callback?: () => void): void {
        if (this.transitionStyle === 0) {
            this.newWorldScale(fromId, new vec3(0, 0, 0), duration, () => {
                this.toggleUIComposite(fromId, false);
                this.toggleUIComposite(toId, true);
                this.newWorldScale(toId, new vec3(1, 1, 1), duration, () => {
                    if (callback) callback();
                });
            });
        } else if (this.transitionStyle === 1) {
            this.toggleUIComposite(fromId, false);
            this.toggleUIComposite(toId, true);
            if (callback) callback();
        }
    }

    // Loading bar update

    private tickLoadProgress(): void {
        this.loadingBarMaterial.mainPass.progress =
            global.utils.lerp(this.loadingBarMaterial.mainPass.progress, this.chaseProgress, 0.1);
        if (!this.loadingBarDismissed && this.loadingBarMaterial.mainPass.progress > 0.98) {
            this.loadingBarDismissed = true;
            this.newWorldScale(this.currentView, new vec3(0, 0, 0), this.defaultDuration, () => {
                this.toggleUIComposite(this.currentView, false);
                this.tryBeginStoryIntroOrGameplay();
            });
            this.loadingBarMaterial.mainPass.progress = 0;
            this.chaseProgress = 0;
            this.loadEvent.enabled = false;
        }
    }

    // Story intro after loading

    private beginLoadingSession(): void {
        this.loadingBarDismissed = false;
        this.pendingGameplayStart = null;
        this.cleanupStoryIntro();
        const gf = this.gameFlow as unknown as { resetGameplaySession?: () => void };
        gf.resetGameplaySession?.();
    }

    private tryBeginStoryIntroOrGameplay(): void {
        if (!this.loadingBarDismissed || !this.pendingGameplayStart || this.storyIntroActive) return;
        const startGameplay = this.pendingGameplayStart;
        this.pendingGameplayStart = null;
        this.runStoryIntroSequence(startGameplay);
    }

    private prepareStoryIntroHidden(): void {
        this.cleanupStoryIntro();
    }

    private cleanupStoryIntro(): void {
        this.storyIntroActive = false;
        this.stopStoryIntroAnim();
        const label = this.resolveStoryIntroText();
        if (label) {
            label.text = "";
            this.setStoryIntroTextAlpha(label, 0);
            label.getSceneObject().getTransform().setLocalScale(
                new vec3(ViewController.STORY_INTRO_SCALE_START, ViewController.STORY_INTRO_SCALE_START, ViewController.STORY_INTRO_SCALE_START)
            );
        }
        if (this.storyIntroView) this.storyIntroView.enabled = false;
    }

    private resolveStoryIntroText(): Text | null {
        if (!this.storyIntroView) return null;
        return this.findTextOnObject(this.storyIntroView);
    }

    private findTextOnObject(root: SceneObject): Text | null {
        const onRoot = (root as any).getComponent("Component.Text") as Text | null;
        if (onRoot) return onRoot;
        const childCount = root.getChildrenCount();
        for (let i = 0; i < childCount; i++) {
            const found = this.findTextOnObject(root.getChild(i));
            if (found) return found;
        }
        return null;
    }

    private hasStoryIntroContent(): boolean {
        return !!(this.introPart1 && this.introPart1.length) ||
            !!(this.introPart2 && this.introPart2.length);
    }

    private runStoryIntroSequence(onGameplayReady: () => void): void {
        const label = this.resolveStoryIntroText();
        if (!this.storyIntroView || !label || !this.hasStoryIntroContent()) {
            onGameplayReady();
            return;
        }

        this.storyIntroActive = true;
        this.storyIntroView.enabled = true;
        label.text = "";
        this.setStoryIntroTextAlpha(label, 0);

        const part1 = this.introPart1 || "";
        const part2 = this.introPart2 || "";
        const holdSec = Math.max(0, this.storyIntroHoldDuration);
        const fadeSec = Math.max(0.1, this.storyIntroFadeDuration);

        const finishIntro = (): void => {
            this.cleanupStoryIntro();
            onGameplayReady();
        };

        const playPart = (text: string, onDone: () => void): void => {
            if (!this.storyIntroActive || !text.length) {
                onDone();
                return;
            }
            this.animateStoryIntroPart(text, fadeSec, holdSec, onDone);
        };

        if (!part1.length) {
            playPart(part2, finishIntro);
            return;
        }

        playPart(part1, () => {
            if (!part2.length) {
                finishIntro();
                return;
            }
            playPart(part2, finishIntro);
        });
    }

    private stopStoryIntroAnim(): void {
        if (this.storyIntroAnimTween) {
            try {
                this.storyIntroAnimTween.stop();
            } catch (e) {}
            this.storyIntroAnimTween = null;
        }
    }

    /** Fade in, scale up continuously from 0.5, hold, fade out — one tween per part. */
    private animateStoryIntroPart(text: string, fadeSec: number, holdSec: number, onDone: () => void): void {
        const label = this.resolveStoryIntroText();
        if (!label || !this.storyIntroActive) {
            onDone();
            return;
        }

        const tr = label.getSceneObject().getTransform();
        const scaleStart = ViewController.STORY_INTRO_SCALE_START;
        this.stopStoryIntroAnim();

        label.text = text;
        this.setStoryIntroTextAlpha(label, 0);
        tr.setLocalScale(new vec3(scaleStart, scaleStart, scaleStart));

        const totalSec = fadeSec * 2 + holdSec;
        const fadeInPortion = totalSec > 0 ? fadeSec / totalSec : 0.22;
        const fadeOutStart = totalSec > 0 ? (fadeSec + holdSec) / totalSec : 0.78;
        const scaleSpan = 1 - scaleStart;

        this.storyIntroAnimTween = LSTween.rawTween(Math.max(1, totalSec * 1000))
            .onUpdate((obj: { t: number }) => {
                const t = obj.t;
                const scaleProgress = fadeInPortion > 0
                    ? (t / fadeInPortion) * ViewController.STORY_INTRO_SCALE_SPEED
                    : t * ViewController.STORY_INTRO_SCALE_SPEED;
                const scaleT = scaleStart + scaleSpan * scaleProgress;
                tr.setLocalScale(new vec3(scaleT, scaleT, scaleT));

                let alpha = 1;
                if (t < fadeInPortion) {
                    alpha = fadeInPortion > 0 ? t / fadeInPortion : 1;
                } else if (t > fadeOutStart) {
                    const fadeSpan = 1 - fadeOutStart;
                    alpha = fadeSpan > 0 ? (1 - t) / fadeSpan : 0;
                }
                this.setStoryIntroTextAlpha(label, alpha);
            })
            .onComplete(() => {
                this.storyIntroAnimTween = null;
                tr.setLocalScale(new vec3(scaleStart, scaleStart, scaleStart));
                this.setStoryIntroTextAlpha(label, 0);
                label.text = "";
                onDone();
            })
            .start();
    }

    private setStoryIntroTextAlpha(text: Text, alpha: number): void {
        const a = Math.max(0, Math.min(1, alpha));
        const fill = text.textFill.color;
        fill.a = a;
        text.textFill.color = fill;
        const shadow = text.dropshadowSettings.fill.color;
        shadow.a = a;
        text.dropshadowSettings.fill.color = shadow;
        const outline = text.outlineSettings.fill.color;
        outline.a = a;
        text.outlineSettings.fill.color = outline;
    }

    // Radial pinch-hold loop

    private setRadialProgress01(v: number): void {
        this.radialProgress = Math.max(0, Math.min(1, v));
        if (this.holdRadialMaterial && this.holdRadialMaterial.mainPass) {
            this.holdRadialMaterial.mainPass.progress = this.radialProgress;
        }
    }

    // SIK.getTargetingInteractors() allocates a fresh array on every call. The
    // interactor instances themselves are stable singletons, so we cache the
    // references once and read their live trigger state each frame instead of
    // re-allocating while a hold is in progress.
    private cachedInteractors: any[] | null = null;

    private resolvePrimaryInteractor(): any {
        if (!this.cachedInteractors || this.cachedInteractors.length === 0) {
            const list = SIK.InteractionManager.getTargetingInteractors();
            if (list && list.length) this.cachedInteractors = list;
            return list && list.length ? list[0] : null;
        }
        let fallback: any = null;
        for (let i = 0; i < this.cachedInteractors.length; i++) {
            const it = this.cachedInteractors[i];
            if (!it) continue;
            if (!fallback) fallback = it;
            if (typeof it.isTargeting !== "function" || it.isTargeting()) return it;
        }
        return fallback;
    }

    private isPinchDownInAir(primaryInteractor: any): boolean {
        if (!primaryInteractor) return false;
        const pinchDown = primaryInteractor.currentTrigger !== InteractorTriggerType.None;
        const setupRoot = global.hexenfurtSetupViewRoot;
        const hitInfo = primaryInteractor.targetHitInfo;
        const inAir =
            (hitInfo == null) ||
            (hitInfo.hit &&
             hitInfo.hit.collider &&
             hitInfo.hit.collider.getSceneObject() &&
             (
                (setupRoot && hitInfo.hit.collider.getSceneObject() === setupRoot) ||
                hitInfo.hit.collider.getSceneObject().name === "Setup View"
             ));
        return pinchDown && inAir;
    }

    private tickPinchHold(): void {
        this.archiveHighlight.enabled = global.newlyAcquiredLore != null;

        if (!this.canHold) {
            this.holdArmed = false;
            this.waitForRelease = false;
            this.setRadialProgress01(0);
            return;
        }

        const primary = this.resolvePrimaryInteractor();
        const now = getTime();

        if (this.isPinchDownInAir(primary)) {
            if (!this.holdArmed || (primary && primary.previousTrigger === InteractorTriggerType.None)) {
                this.holdArmed = true;
                if (!this.waitForRelease) {
                    this.holdStart = now;
                    this.setRadialProgress01(0);
                }
            }

            if (this.holdArmed && !this.waitForRelease) {
                const elapsed = now - this.holdStart;
                const effectiveFillTime = Math.max(0.001, this.totalHoldTime - this.holdDelay);

                if (elapsed < this.holdDelay) {
                    this.setRadialProgress01(0);
                } else {
                    const p = Math.min((elapsed - this.holdDelay) / effectiveFillTime, 1.0);
                    this.setRadialProgress01(p);

                    if (p >= 1.0) {
                        this.waitForRelease = true;
                        this.setRadialProgress01(1.0);
                        this.proceedTap();
                    }
                }
            }
        } else {
            this.holdArmed = false;
            if (this.waitForRelease) this.waitForRelease = false;
            this.setRadialProgress01(0);
        }
    }

    // Leaderboard hint popup

    private prepareLeaderboardHintHidden(): void {
        this.stopLeaderboardHintAnim();
        this.lbHintActive = false;
        if (!this.leaderboardHint) return;
        this.leaderboardHint.enabled = true;
        this.leaderboardHint.getTransform().setLocalScale(new vec3(0, 0, 0));
    }

    private stopLeaderboardHintAnim(): void {
        if (!this.leaderboardHintAnimEvent) return;
        this.leaderboardHintAnimEvent.enabled = false;
        this.removeEvent(this.leaderboardHintAnimEvent);
        this.leaderboardHintAnimEvent = null;
    }

    private showLeaderboardHint(onShown?: () => void): void {
        if (!this.leaderboardHint) {
            if (onShown) onShown();
            return;
        }
        this.stopLeaderboardHintAnim();
        this.leaderboardHint.enabled = true;
        this.leaderboardHint.getTransform().setLocalScale(new vec3(0, 0, 0));
        this.animateLeaderboardHintScale(new vec3(1, 1, 1), true, onShown);
    }

    private hideLeaderboardHint(onHidden?: () => void): void {
        if (!this.leaderboardHint) {
            if (onHidden) onHidden();
            return;
        }
        this.stopLeaderboardHintAnim();
        this.animateLeaderboardHintScale(new vec3(0, 0, 0), false, onHidden);
    }

    private animateLeaderboardHintScale(
        targetScale: vec3,
        growing: boolean,
        onComplete?: () => void
    ): void {
        if (!this.leaderboardHint) {
            if (onComplete) onComplete();
            return;
        }

        const tr = this.leaderboardHint.getTransform();
        const startScale = tr.getLocalScale();
        const duration = ViewController.LEADERBOARD_HINT_SCALE_DURATION;
        const startTime = getTime();
        const ev = this.createEvent("UpdateEvent");
        this.leaderboardHintAnimEvent = ev;

        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / duration, 1);
            const eased = growing
                ? this.easeBackOut(t, 0.18)
                : this.easeInOutCubic(t);
            tr.setLocalScale(vec3.lerp(startScale, targetScale, eased));
            if (t >= 1) {
                tr.setLocalScale(targetScale);
                this.stopLeaderboardHintAnim();
                if (onComplete) onComplete();
            }
        });
    }

    // Main menu (animated buttons + interactables)

    private buildMainMenuButtonTargets(): void {
        if (!this.playInteractable || !this.archiveInteractable || !this.loreInteractable) return;
        this.mainMenuButtons = [
            this.createMenuButtonTarget("play", this.playInteractable, new vec3(0, 0, 0), new vec3(0, 0, 0), 0),
            this.createMenuButtonTarget("archive", this.archiveInteractable, new vec3(0, 0, -0.2), new vec3(-12, -1.5, -0), 7),
            this.createMenuButtonTarget("lore", this.loreInteractable, new vec3(0, 0, -0.4), new vec3(12, -1.5, -0), -7),
        ];
        this.simulatorButtonTransform = this.findSimulatorButtonTransform();
    }

    private createMenuButtonTarget(
        id: MainMenuButtonId,
        interactable: ScriptComponent,
        restPosition: vec3,
        fanPosition: vec3,
        fanEulerZDeg: number
    ): MainMenuButtonAnimTarget {
        const interactableObject = interactable.getSceneObject();
        const buttonObject = interactableObject.getParent();
        return {
            id,
            transform: buttonObject.getTransform(),
            restPosition,
            fanPosition,
            fanEulerZDeg,
            hoverChase: 0,
            isHovered: false,
        };
    }

    private prepareMainMenuHidden(): void {
        this.stopLogoWiggle();
        if (this.mainMenuRoot) this.mainMenuRoot.enabled = false;
        if (this.hexenfurtLogo) {
            this.hexenfurtLogo.enabled = false;
            const tr = this.hexenfurtLogo.getTransform();
            tr.setLocalScale(new vec3(0, 0, 0));
            tr.setLocalRotation(this.logoBaseLocalRotation);
        }
        this.mainMenuActive = false;
        this.mainMenuInputReady = false;
        this.resetMainMenuButtonTransforms(0);
        if (this.simulatorButtonTransform) {
            this.simulatorButtonTransform.setLocalScale(new vec3(0, 0, 0));
            this.simulatorButtonTransform.setLocalPosition(new vec3(0, 0, 0));
            this.simulatorButtonTransform.setLocalRotation(quat.quatIdentity());
        }
        this.resetSettingsButtonTransformScale(0);
        this.setMainMenuInteractablesEnabled(false);
    }

    private resetMainMenuButtonTransforms(scale: number): void {
        for (let i = 0; i < this.mainMenuButtons.length; i++) {
            const btn = this.mainMenuButtons[i];
            const s = scale * ViewController.MENU_BTN_SCALE.x;
            btn.transform.setLocalScale(new vec3(s, s, s));
            btn.transform.setLocalPosition(btn.restPosition);
            btn.transform.setLocalRotation(quat.quatIdentity());
            btn.hoverChase = 0;
            btn.isHovered = false;
        }
    }

    private showMainMenu(): void {
        if (this.mainMenuAnimating) return;
        if (this.mainMenuActive && this.mainMenuInputReady) return;

        this.stopMainMenuAnimation();
        this.mainMenuAnimating = true;
        this.mainMenuInputReady = false;
        this.mainMenuActive = true;
        this.clearMainMenuHover();

        if (this.mainMenuRoot) this.mainMenuRoot.enabled = true;
        if (this.hexenfurtLogo) {
            this.hexenfurtLogo.enabled = true;
            const tr = this.hexenfurtLogo.getTransform();
            tr.setLocalScale(new vec3(0, 0, 0));
            tr.setLocalRotation(this.logoBaseLocalRotation);
        }

        this.resetMainMenuButtonTransforms(0);
        if (this.simulatorButtonTransform) {
            this.simulatorButtonTransform.setLocalScale(new vec3(0, 0, 0));
            this.simulatorButtonTransform.setLocalPosition(new vec3(0, 0, 0));
            this.simulatorButtonTransform.setLocalRotation(quat.quatIdentity());
        }
        this.resetSettingsButtonTransformScale(0);

        this.setMainMenuInteractablesEnabled(false);
        this.setSettingsButtonInteractableEnabled(false);
        this.prepareLockIconsForEntrance();
        this.startLogoWiggle();
        this.runMainMenuEntranceAnimation(() => {
            this.mainMenuAnimating = false;
            this.mainMenuInputReady = true;
            this.applyMainMenuInteractableGating();
            this.mainMenuHoverEvent.enabled = !this.lbHintActive;
            this.applyLockIconsAfterEntrance();
        });
    }

    private returnToMainMenu(): void {
        if (this.mainMenuAnimating) return;
        if (this.settingsActive) {
            this.hideSettingsPanel(() => this.returnToMainMenu());
            return;
        }
        const from = this.currentView;
        if (this.transitionStyle === 0) {
            this.newWorldScale(from, new vec3(0, 0, 0), this.defaultDuration, () => {
                this.toggleUIComposite(from, false);
                this.showMainMenu();
            });
        } else {
            this.toggleUIComposite(from, false);
            this.showMainMenu();
        }
    }

    private dismissMainMenuAndRun(onComplete: () => void, triggerExitParticles: boolean = false): void {
        if (this.lbHintActive) return;
        if (!this.mainMenuActive || this.mainMenuAnimating) return;
        if (this.settingsActive) {
            this.hideSettingsPanel(() => this.playMainMenuExitAnimation(onComplete, triggerExitParticles));
            return;
        }
        this.playMainMenuExitAnimation(onComplete, triggerExitParticles);
    }

    private playMainMenuExitAnimation(onComplete: () => void, triggerParticles: boolean = false): void {
        this.stopMainMenuAnimation();
        this.mainMenuAnimating = true;
        this.mainMenuInputReady = false;
        this.mainMenuHoverEvent.enabled = false;
        this.clearMainMenuHover();
        this.setMainMenuInteractablesEnabled(false);
        this.setSettingsButtonInteractableEnabled(false);
        if (triggerParticles) {
            this.mainMenuParticleBurstFired = false;
        }

        const fanTargets = this.mainMenuButtons.filter((b) => b.fanEulerZDeg !== 0);
        this.animateMainMenuButtons(
            fanTargets,
            (b) => b.restPosition,
            (b) => quat.quatIdentity(),
            ViewController.MENU_HIDE_DURATION * 0.55,
            () => {
                const allTargets = this.collectAllMenuScaleTargets();
                this.animateMainMenuScales(
                    allTargets,
                    false,
                    ViewController.MENU_HIDE_DURATION,
                    false,
                    () => {
                        this.prepareMainMenuHidden();
                        this.mainMenuAnimating = false;
                        if (onComplete) onComplete();
                    },
                    triggerParticles
                        ? {
                            shrinkScaleTrigger: ViewController.MENU_EXIT_PARTICLE_SCALE,
                            onShrinkScaleReached: () => this.triggerMainMenuParticlesOnce(),
                        }
                        : undefined
                );
            }
        );
    }

    private runMainMenuEntranceAnimation(onComplete: () => void): void {
        const allTargets = this.collectAllMenuScaleTargets();
        this.animateMainMenuScales(allTargets, true, ViewController.MENU_SHOW_SCALE_DURATION, true, () => {
            this.runMainMenuFanIn(onComplete);
        });
    }

    private runMainMenuFanIn(onComplete: () => void): void {
        const fanTargets = this.mainMenuButtons.filter((b) => b.fanEulerZDeg !== 0);
        this.animateMainMenuButtons(
            fanTargets,
            (b) => b.fanPosition,
            (b) => this.eulerZToQuat(b.fanEulerZDeg),
            ViewController.MENU_FAN_DURATION,
            onComplete
        );
    }

    private triggerMainMenuParticlesOnce(): void {
        if (this.mainMenuParticleBurstFired) return;
        this.mainMenuParticleBurstFired = true;
        this.triggerMainMenuParticles();
        if (global.soundManager?.playSound) {
            global.soundManager.playSound("paperTear", 1);
        }
    }

    private triggerMainMenuParticles(): void {
        const vfx = this.mainMenuParticlesVfx;
        if (!vfx?.asset) return;

        let duration = this.mainMenuParticleDuration;
        if (duration === undefined || duration === null || duration <= 0.0001) {
            duration = 0.1;
        }

        (vfx.asset.properties as any).burstDuration = getTime() + duration;
    }

    /** After settings close: cards stay at rest pose with zero scale before scale-up + fan. */
    private ensureMenuCardsReadyForSettingsReveal(): void {
        for (let i = 0; i < this.mainMenuButtons.length; i++) {
            const btn = this.mainMenuButtons[i];
            btn.transform.setLocalScale(new vec3(0, 0, 0));
            btn.transform.setLocalPosition(btn.restPosition);
            btn.transform.setLocalRotation(quat.quatIdentity());
            btn.hoverChase = 0;
            btn.isHovered = false;
        }
        if (this.simulatorButtonTransform) {
            this.simulatorButtonTransform.setLocalScale(new vec3(0, 0, 0));
            this.simulatorButtonTransform.setLocalPosition(new vec3(0, 0, 0));
            this.simulatorButtonTransform.setLocalRotation(quat.quatIdentity());
        }
    }

    private collectMenuCardScaleTargets(): MainMenuScaleTarget[] {
        const targets: MainMenuScaleTarget[] = [];
        for (let i = 0; i < this.mainMenuButtons.length; i++) {
            targets.push({ transform: this.mainMenuButtons[i].transform, targetScale: ViewController.MENU_BTN_SCALE });
        }
        if (this.simulatorButtonTransform) {
            targets.push({ transform: this.simulatorButtonTransform, targetScale: ViewController.MENU_BTN_SCALE });
        }
        return targets;
    }

    private collectAllMenuScaleTargets(): MainMenuScaleTarget[] {
        const targets = this.collectMenuCardScaleTargets();
        const settingsTarget = this.collectSettingsButtonScaleTarget();
        if (settingsTarget) {
            targets.push(settingsTarget);
        }
        if (this.hexenfurtLogo) {
            targets.push({ transform: this.hexenfurtLogo.getTransform(), targetScale: this.logoBaseScale });
        }
        return targets;
    }

    private collectSettingsButtonScaleTarget(): MainMenuScaleTarget | null {
        if (!this.settingsButtonTransform) return null;
        const target = this.settingsButtonRestScale || new vec3(1, 1, 1);
        return { transform: this.settingsButtonTransform, targetScale: target };
    }

    private resetSettingsButtonTransformScale(scale: number): void {
        if (!this.settingsButtonTransform) return;
        const target = this.settingsButtonRestScale || new vec3(1, 1, 1);
        const s = scale * target.x;
        this.settingsButtonTransform.setLocalScale(new vec3(s, s, s));
    }

    private openSettingsPanel(): void {
        if (this.lbHintActive) return;
        if (!this.settingsRoot || !this.mainMenuActive || this.mainMenuAnimating || this.settingsActive || this.settingsPanelBusy) {
            return;
        }

        this.settingsPanelBusy = true;
        this.setSettingsButtonMenuOpen(true);
        this.setSettingsButtonInteractableEnabled(false);
        this.stopMainMenuAnimation();
        this.mainMenuAnimating = true;
        this.mainMenuInputReady = false;
        this.mainMenuHoverEvent.enabled = false;
        this.clearMainMenuHover();
        this.setMainMenuInteractablesEnabled(false);

        const fanTargets = this.mainMenuButtons.filter((b) => b.fanEulerZDeg !== 0);
        this.animateMainMenuButtons(
            fanTargets,
            (b) => b.restPosition,
            () => quat.quatIdentity(),
            ViewController.MENU_HIDE_DURATION * 0.55,
            () => {
                const cardTargets = this.collectMenuCardScaleTargets();
                this.animateMainMenuScales(cardTargets, false, ViewController.MENU_HIDE_DURATION, false, () => {
                    this.settingsRoot!.enabled = true;
                    (this.settingsManager as unknown as SettingsManagerApi)?.refreshFromStorage?.();
                    this.scaleGalleryRoot(this.settingsRoot, true, () => {
                        this.settingsActive = true;
                        this.mainMenuAnimating = false;
                        this.mainMenuInputReady = true;
                        this.settingsPanelBusy = false;
                        this.setSettingsButtonInteractableEnabled(true);
                    });
                });
            }
        );
    }

    private hideSettingsPanel(onComplete?: () => void): void {
        if (!this.settingsRoot || !this.settingsActive || this.mainMenuAnimating || this.settingsPanelBusy) {
            if (onComplete) onComplete();
            return;
        }

        this.settingsPanelBusy = true;
        this.setSettingsButtonInteractableEnabled(false);
        this.stopMainMenuAnimation();
        this.mainMenuAnimating = true;
        this.mainMenuInputReady = false;
        this.mainMenuHoverEvent.enabled = false;
        this.clearMainMenuHover();
        this.setMainMenuInteractablesEnabled(false);
        this.setSettingsButtonMenuOpen(false);

        this.scaleGalleryRoot(this.settingsRoot, false, () => {
            this.settingsRoot!.enabled = false;
            this.ensureMenuCardsReadyForSettingsReveal();
            const cardTargets = this.collectMenuCardScaleTargets();
            this.animateMainMenuScales(cardTargets, true, ViewController.MENU_SHOW_SCALE_DURATION, true, () => {
                this.runMainMenuFanIn(() => {
                        this.settingsActive = false;
                        this.mainMenuAnimating = false;
                        this.mainMenuInputReady = true;
                        this.applyMainMenuInteractableGating();
                        this.mainMenuHoverEvent.enabled = !this.lbHintActive;
                        this.settingsPanelBusy = false;
                        if (onComplete) onComplete();
                    }
                );
            });
        });
    }

    private animateMainMenuScales(
        targets: MainMenuScaleTarget[],
        growing: boolean,
        duration: number,
        useOvershoot: boolean,
        onComplete: () => void,
        options?: { shrinkScaleTrigger?: number; onShrinkScaleReached?: () => void }
    ): void {
        if (!targets.length) {
            onComplete();
            return;
        }

        const startScales: vec3[] = [];
        for (let i = 0; i < targets.length; i++) {
            startScales.push(targets[i].transform.getLocalScale());
        }

        const startTime = getTime();
        const ev = this.createEvent("UpdateEvent");
        this.mainMenuAnimEvent = ev;
        const zero = new vec3(0, 0, 0);
        let shrinkScaleTriggered = false;
        const shrinkScaleTrigger = options?.shrinkScaleTrigger ?? 0.5;

        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / duration, 1);
            const eased = growing
                ? (useOvershoot ? this.easeBackOut(t, 0.18) : this.easeInOutCubic(t))
                : this.easeInOutCubic(t);

            for (let i = 0; i < targets.length; i++) {
                const tgt = targets[i];
                if (growing) {
                    const growT = useOvershoot ? this.easeBackOut(t, 0.18) : eased;
                    tgt.transform.setLocalScale(vec3.lerp(startScales[i], tgt.targetScale, growT));
                } else {
                    tgt.transform.setLocalScale(vec3.lerp(startScales[i], zero, eased));
                }
            }

            if (
                !growing &&
                !shrinkScaleTriggered &&
                options?.onShrinkScaleReached &&
                eased >= shrinkScaleTrigger
            ) {
                shrinkScaleTriggered = true;
                options.onShrinkScaleReached();
            }

            if (t >= 1) {
                for (let i = 0; i < targets.length; i++) {
                    targets[i].transform.setLocalScale(growing ? targets[i].targetScale : zero);
                }
                ev.enabled = false;
                this.removeEvent(ev);
                this.mainMenuAnimEvent = null;
                onComplete();
            }
        });
    }

    private animateMainMenuButtons(
        buttons: MainMenuButtonAnimTarget[],
        positionFor: (b: MainMenuButtonAnimTarget) => vec3,
        rotationFor: (b: MainMenuButtonAnimTarget) => quat,
        duration: number,
        onComplete: () => void,
        options?: { nearCompleteT?: number; onNearComplete?: () => void }
    ): void {
        if (!buttons.length) {
            onComplete();
            return;
        }

        const startPositions: vec3[] = [];
        const startRotations: quat[] = [];
        for (let i = 0; i < buttons.length; i++) {
            startPositions.push(buttons[i].transform.getLocalPosition());
            startRotations.push(buttons[i].transform.getLocalRotation());
        }

        const startTime = getTime();
        const ev = this.createEvent("UpdateEvent");
        this.mainMenuAnimEvent = ev;
        let nearCompleteFired = false;
        const nearCompleteT = options?.nearCompleteT ?? 1;

        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / duration, 1);
            const eased = this.easeInOutCubic(t);

            if (!nearCompleteFired && options?.onNearComplete && t >= nearCompleteT) {
                nearCompleteFired = true;
                options.onNearComplete();
            }

            for (let i = 0; i < buttons.length; i++) {
                const btn = buttons[i];
                const targetPos = positionFor(btn);
                const targetRot = rotationFor(btn);
                btn.transform.setLocalPosition(vec3.lerp(startPositions[i], targetPos, eased));
                btn.transform.setLocalRotation(quat.slerp(startRotations[i], targetRot, eased));
            }

            if (t >= 1) {
                for (let i = 0; i < buttons.length; i++) {
                    buttons[i].transform.setLocalPosition(positionFor(buttons[i]));
                    buttons[i].transform.setLocalRotation(rotationFor(buttons[i]));
                }
                ev.enabled = false;
                this.removeEvent(ev);
                this.mainMenuAnimEvent = null;
                onComplete();
            }
        });
    }

    private bindMainMenuInteractables(): void {
        if (this.mainMenuInteractablesBound) return;
        this.mainMenuInteractablesBound = true;

        this.bindMenuInteractable(this.playInteractable, () => {
            if (!this.canAcceptMainMenuPress("play")) return;
            this.dismissMainMenuAndRun(() => this.beginStartFlow(), true);
        });
        this.bindMenuInteractable(this.loreInteractable, () => {
            if (!this.canAcceptMainMenuPress("lore")) return;
            if (!this.firstGameUnlocked) {
                this.shakeLockedIcon("lore");
                return;
            }
            this.dismissMainMenuAndRun(() => this.beginOpenLoreGallery());
        });
        this.bindMenuInteractable(this.archiveInteractable, () => {
            if (!this.canAcceptMainMenuPress("archive")) return;
            if (!this.firstGameUnlocked) {
                this.shakeLockedIcon("archive");
                return;
            }
            this.dismissMainMenuAndRun(() => this.beginOpenArchiveGallery());
        });

        this.bindSimulatorInteractableIfPresent();
        this.bindSettingsButtonIfPresent();
    }

    private bindSettingsButtonIfPresent(): void {
        if (!this.settingsButton) return;

        this.settingsButtonTransform = this.settingsButton.getSceneObject().getTransform();
        this.captureSettingsButtonRestStyle();
        this.captureSettingsButtonLabel();
        this.captureSettingsButtonTransform();

        const onPress = (): void => {
            if (this.lbHintActive) return;
            if (!this.mainMenuActive || this.mainMenuAnimating || this.settingsPanelBusy) return;
            this.toggleSettings();
        };
        const onRelease = (): void => this.resetSettingsButtonTransform();

        const so = this.settingsButton.getSceneObject();
        const capsule = (so as any).getComponent(CAPSULE_BUTTON_TYPE_NAME) as {
            onTriggerUp?: { add: (fn: () => void) => void };
            onTriggerEnd?: { add: (fn: () => void) => void };
        } | null;
        if (capsule?.onTriggerUp) {
            capsule.onTriggerUp.add(onPress);
            if (capsule.onTriggerEnd) {
                capsule.onTriggerEnd.add(onRelease);
            }
            return;
        }

        const api = this.settingsButton as unknown as MainMenuInteractableApi;
        if (api.onTriggerStart) {
            api.onTriggerStart.add(onPress);
        }
    }

    private captureSettingsButtonRestStyle(): void {
        const capsule = this.getSettingsCapsuleButton();
        if (!capsule) return;
        const style = capsule._style || capsule.style;
        if (style && style.length > 0) {
            this.settingsButtonRestStyle = style;
        }
    }

    /** SnapOS2 Special + "Main Menu" label while settings is open; restore when closed. */
    private setSettingsButtonMenuOpen(open: boolean, animateLabel: boolean = true, force: boolean = false): void {
        if (!force && this.settingsButtonUiOpen === open) {
            return;
        }
        this.settingsButtonUiOpen = open;

        if (animateLabel) {
            const targetLabel = open
                ? ViewController.SETTINGS_BUTTON_OPEN_LABEL
                : this.settingsButtonClosedLabel;
            this.transitionSettingsButtonLabel(targetLabel);
        }

        const btn = this.getSettingsCapsuleButton();
        if (!btn || !btn._initialized) {
            return;
        }

        const targetStyle = open
            ? ViewController.SETTINGS_BUTTON_ACTIVE_STYLE
            : this.settingsButtonRestStyle;

        btn._style = targetStyle;
        btn._theme = ViewController.SETTINGS_BUTTON_THEME;
        this.applySettingsButtonVisualStyleInPlace(btn, targetStyle);
    }

    private captureSettingsButtonLabel(): void {
        if (!this.settingsButton) return;
        const text = this.findLabelTextOnButton(this.settingsButton.getSceneObject());
        if (!text) return;
        this.settingsButtonLabelText = text;
        if (text.text && text.text.length > 0) {
            this.settingsButtonClosedLabel = text.text;
        }
    }

    private transitionSettingsButtonLabel(newText: string, onDone?: () => void): void {
        const label = this.settingsButtonLabelText;
        if (!label) {
            if (onDone) onDone();
            return;
        }

        this.stopSettingsButtonLabelTween();
        const fadeMs = this.settingsButtonLabelFadeMs();
        const hasVisibleText =
            (label.text || "").length > 0 && label.textFill.color.a > 0.01;

        const fadeIn = (): void => {
            this.setSettingsButtonLabelAlpha(label, 0);
            label.text = newText;
            this.settingsButtonLabelTween = LSTween.textAlphaFromTo(label, 0, 1, fadeMs)
                .onComplete(() => {
                    this.settingsButtonLabelTween = null;
                    if (onDone) onDone();
                })
                .start();
        };

        if (!hasVisibleText) {
            fadeIn();
            return;
        }

        this.settingsButtonLabelTween = LSTween.textAlphaTo(label, 0, fadeMs)
            .onComplete(() => {
                this.settingsButtonLabelTween = null;
                fadeIn();
            })
            .start();
    }

    private stopSettingsButtonLabelTween(): void {
        if (this.settingsButtonLabelTween) {
            try {
                this.settingsButtonLabelTween.stop();
            } catch (e) {}
            this.settingsButtonLabelTween = null;
        }
    }

    private settingsButtonLabelFadeMs(): number {
        return Math.max(1, this.settingsButtonLabelFadeDuration * 1000);
    }

    private setSettingsButtonLabelAlpha(text: Text, alpha: number): void {
        const a = Math.max(0, Math.min(1, alpha));
        const fill = text.textFill.color;
        fill.a = a;
        text.textFill.color = fill;
        const shadow = text.dropshadowSettings.fill.color;
        shadow.a = a;
        text.dropshadowSettings.fill.color = shadow;
        const outline = text.outlineSettings.fill.color;
        outline.a = a;
        text.outlineSettings.fill.color = outline;
    }

    private findLabelTextOnButton(buttonRoot: SceneObject): Text | null {
        const onRoot = (buttonRoot as any).getComponent("Component.Text") as Text | null;
        if (onRoot) return onRoot;

        const childCount = buttonRoot.getChildrenCount();
        for (let i = 0; i < childCount; i++) {
            const found = this.findLabelTextOnButton(buttonRoot.getChild(i));
            if (found) return found;
        }
        return null;
    }

    private captureSettingsButtonTransform(): void {
        if (!this.settingsButtonTransform) return;
        this.settingsButtonRestPosition = this.settingsButtonTransform.getLocalPosition();
        this.settingsButtonRestScale = this.settingsButtonTransform.getLocalScale();
        this.settingsButtonRestRotation = this.settingsButtonTransform.getLocalRotation();
    }

    private resetSettingsButtonTransform(): void {
        if (!this.settingsButton || !this.settingsButtonRestPosition || !this.settingsButtonRestScale) {
            return;
        }

        const btn = this.getSettingsCapsuleButton();
        const visual = btn?.visual;
        if (visual) {
            try {
                visual._updateScaleCancelSet?.cancel();
                visual._updatePositionCancelSet?.cancel();
                visual._colorChangeCancelSet?.cancel();
            } catch (e) {}
            if (visual.transform) {
                visual.transform.setLocalScale(new vec3(1, 1, 1));
                visual.transform.setLocalPosition(new vec3(0, 0, 0));
            }
            visual._currentScale = new vec3(1, 1, 1);
            visual._currentPosition = new vec3(0, 0, 0);
            if (btn.setState) {
                btn.setState("default");
            }
        }

        const tr = this.settingsButton.getSceneObject().getTransform();
        tr.setLocalPosition(this.settingsButtonRestPosition);
        tr.setLocalScale(this.settingsButtonRestScale);
        if (this.settingsButtonRestRotation) {
            tr.setLocalRotation(this.settingsButtonRestRotation);
        }
    }

    /** Updates CapsuleButton theme style in-place (avoids stacking mesh components). */
    private applySettingsButtonVisualStyleInPlace(btn: SettingsCapsuleButtonApi, style: string): void {
        const visual = btn.visual;
        if (!visual) return;

        const params = CapsuleButtonParameters[style];
        if (!params) return;

        const stateName = btn.stateName || "default";
        if (visual.visualArgs) {
            visual.visualArgs.style = {
                visualElementType: "CapsuleButton",
                style,
                theme: ViewController.SETTINGS_BUTTON_THEME,
            };
        }

        try {
            visual.applyStyleParameters?.(params);
            visual.updateVisualStates?.();
            if (btn.setState) {
                btn.setState(stateName);
            }
        } catch (e) {
            print("[ViewController] Settings button style swap failed: " + e);
        }

        this.resetSettingsButtonTransform();
    }

    private getSettingsCapsuleButton(): SettingsCapsuleButtonApi | null {
        if (!this.settingsButton) return null;
        const so = this.settingsButton.getSceneObject();
        const comp = (so as any).getComponent(CAPSULE_BUTTON_TYPE_NAME);
        return comp || null;
    }

    private bindMenuInteractable(interactable: ScriptComponent, onPress: () => void): void {
        const api = interactable as unknown as MainMenuInteractableApi;
        const button = this.mainMenuButtons.find(
            (b) => b.transform.getSceneObject() === interactable.getSceneObject().getParent()
        );

        api.onHoverEnter.add(() => {
            if (this.lbHintActive || !this.mainMenuInputReady || this.mainMenuAnimating) return;
            if (button) {
                button.isHovered = true;
                this.mainMenuHoverEvent.enabled = true;
            }
        });
        api.onHoverExit.add(() => {
            if (button) {
                button.isHovered = false;
                this.mainMenuHoverEvent.enabled = true;
            }
        });
        api.onTriggerStart.add(() => onPress());
    }

    private bindSimulatorInteractableIfPresent(): void {
        const simObject = this.findSimulatorEditorObject();
        if (!simObject) return;

        const onPress = (): void => {
            if (this.lbHintActive || this.settingsActive || !this.mainMenuInputReady || this.mainMenuAnimating) return;
            this.dismissMainMenuAndRun(() => this.beginSimulatorSetup());
        };

        const capsule = (simObject as any).getComponent(CAPSULE_BUTTON_TYPE_NAME) as {
            onTriggerUp?: { add: (fn: () => void) => void };
        } | null;
        if (capsule?.onTriggerUp) {
            capsule.onTriggerUp.add(onPress);
            return;
        }

        const scripts = simObject.getComponents("Component.ScriptComponent") as ScriptComponent[];
        for (let i = 0; i < scripts.length; i++) {
            const api = scripts[i] as unknown as MainMenuInteractableApi;
            if (!api.onTriggerStart) continue;
            api.onTriggerStart.add(onPress);
            break;
        }
    }

    private canAcceptMainMenuPress(_id: MainMenuButtonId): boolean {
        if (this.settingsActive || this.lbHintActive || !this.mainMenuInputReady || this.mainMenuAnimating) return false;
        return true;
    }

    private applyMainMenuInteractableGating(): void {
        const enabled = !this.lbHintActive && this.mainMenuInputReady && !this.mainMenuAnimating;
        this.setMainMenuInteractablesEnabled(enabled);
        this.setSettingsButtonInteractableEnabled(enabled);
    }

    private setMainMenuInteractablesEnabled(enabled: boolean): void {
        (this.playInteractable as unknown as MainMenuInteractableApi).enabled = enabled;
        (this.loreInteractable as unknown as MainMenuInteractableApi).enabled = enabled;
        (this.archiveInteractable as unknown as MainMenuInteractableApi).enabled = enabled;
    }

    private setSettingsButtonInteractableEnabled(enabled: boolean): void {
        const capsule = this.getSettingsCapsuleButton();
        if (capsule && typeof capsule.inactive !== "undefined") {
            capsule.inactive = !enabled;
            return;
        }
        if (this.settingsButton) {
            (this.settingsButton as unknown as MainMenuInteractableApi).enabled = enabled;
        }
    }

    private tickMainMenuHover(): void {
        if (this.lbHintActive || !this.mainMenuInputReady || this.mainMenuAnimating) {
            this.mainMenuHoverEvent.enabled = false;
            return;
        }

        let anyActive = false;
        for (let i = 0; i < this.mainMenuButtons.length; i++) {
            const btn = this.mainMenuButtons[i];
            const target = btn.isHovered ? 1 : 0;
            btn.hoverChase = global.utils.lerp(btn.hoverChase, target, 0.18);
            if (Math.abs(btn.hoverChase - target) > 0.01) anyActive = true;

            const hoverScale = ViewController.MENU_BTN_SCALE.x *
                (1 + (ViewController.MENU_HOVER_SCALE_MULT - 1) * btn.hoverChase);
            btn.transform.setLocalScale(new vec3(hoverScale, hoverScale, hoverScale));
        }

        if (!anyActive) {
            let allSettled = true;
            for (let i = 0; i < this.mainMenuButtons.length; i++) {
                if (this.mainMenuButtons[i].hoverChase > 0.01 && !this.mainMenuButtons[i].isHovered) {
                    allSettled = false;
                    break;
                }
                if (this.mainMenuButtons[i].isHovered) allSettled = false;
            }
            if (allSettled) this.mainMenuHoverEvent.enabled = false;
        }
    }

    private clearMainMenuHover(): void {
        for (let i = 0; i < this.mainMenuButtons.length; i++) {
            this.mainMenuButtons[i].isHovered = false;
            this.mainMenuButtons[i].hoverChase = 0;
        }
    }

    private stopMainMenuAnimation(): void {
        if (this.mainMenuAnimEvent) {
            this.mainMenuAnimEvent.enabled = false;
            this.removeEvent(this.mainMenuAnimEvent);
            this.mainMenuAnimEvent = null;
        }
    }

    private findSimulatorButtonTransform(): Transform | null {
        const simObject = this.findSimulatorEditorObject();
        return simObject ? simObject.getTransform() : null;
    }

    private findSimulatorEditorObject(): SceneObject | null {
        if (!this.mainMenuRoot) return null;
        return this.findEditorScriptTarget(this.mainMenuRoot);
    }

    private findEditorScriptTarget(root: SceneObject): SceneObject | null {
        const scripts = root.getComponents("Component.ScriptComponent") as ScriptComponent[];
        for (let i = 0; i < scripts.length; i++) {
            const editorObject = (scripts[i] as any).editorObject as SceneObject | undefined;
            if (editorObject) return editorObject;
        }
        const childCount = root.getChildrenCount();
        for (let c = 0; c < childCount; c++) {
            const found = this.findEditorScriptTarget(root.getChild(c));
            if (found) return found;
        }
        return null;
    }

    private startLogoWiggle(): void {
        if (!this.hexenfurtLogo) return;
        this.logoWiggleStartTime = getTime();
        if (!this.logoWiggleEvent) {
            this.logoWiggleEvent = this.createEvent("UpdateEvent");
            this.logoWiggleEvent.bind(() => this.tickLogoWiggle());
        }
        this.logoWiggleEvent.enabled = true;
    }

    private stopLogoWiggle(): void {
        if (this.logoWiggleEvent) this.logoWiggleEvent.enabled = false;
        if (this.hexenfurtLogo) {
            this.hexenfurtLogo.getTransform().setLocalRotation(this.logoBaseLocalRotation);
        }
    }

    private tickLogoWiggle(): void {
        if (!this.hexenfurtLogo) return;
        const elapsed = getTime() - this.logoWiggleStartTime;
        const amplitudeRad = ViewController.LOGO_WIGGLE_DEG * Math.PI / 180;
        const omega = (2 * Math.PI) / ViewController.LOGO_WIGGLE_PERIOD_SEC;
        const angle = amplitudeRad * Math.sin(omega * elapsed);
        const wiggleQ = quat.fromEulerAngles(0, 0, angle);
        this.hexenfurtLogo.getTransform().setLocalRotation(this.logoBaseLocalRotation.multiply(wiggleQ));
    }

    // Lore / Archive lock icons

    private captureLockIcons(): void {
        if (this.iconsCaptured) return;
        this.iconsCaptured = true;

        if (this.loreIcon) {
            const tr = this.loreIcon.getSceneObject().getTransform();
            this.loreIconTransform = tr;
            this.loreIconBaseScale = tr.getLocalScale();
            this.loreIconBaseRotation = tr.getLocalRotation();
        }
        if (this.archiveIcon) {
            const tr = this.archiveIcon.getSceneObject().getTransform();
            this.archiveIconTransform = tr;
            this.archiveIconBaseScale = tr.getLocalScale();
            this.archiveIconBaseRotation = tr.getLocalRotation();
        }

        // Locked until the menu reveal decides otherwise.
        this.applyIconMaterialState(ViewController.ICON_LOCKED_STATE);
    }

    /** Set the lock/unlock shader value on both icon materials (0..1). */
    private applyIconMaterialState(value: number): void {
        this.iconStateValue = value;
        this.writeIconState(this.loreIcon, value);
        this.writeIconState(this.archiveIcon, value);
    }

    private writeIconState(icon: Image | null, value: number): void {
        if (!icon) return;
        const mat = icon.mainMaterial;
        if (mat && mat.mainPass) (mat.mainPass as any).state = value;
    }

    /** Returning players (played before, no first-game pulse): unlock icons
     *  instantly when the lens/menu appears, not during the button unfan. */
    private isReturningPlayerIconReveal(): boolean {
        return this.iconsRevealPending && !this.iconsPulseOnReveal;
    }

    /** Called as the menu begins its entrance: stop any in-flight icon anims and
     *  set the lock shading to its pre-reveal value (locked, unless already
     *  revealed earlier this session or a returning player). */
    private prepareLockIconsForEntrance(): void {
        this.stopIconStateAnim();
        this.stopIconPulse();
        this.stopIconShake("lore");
        this.stopIconShake("archive");
        this.restoreIconRestTransforms();

        if (this.firstGameUnlocked && (!this.iconsRevealPending || this.isReturningPlayerIconReveal())) {
            this.applyIconMaterialState(ViewController.ICON_UNLOCKED_STATE);
            if (this.isReturningPlayerIconReveal()) {
                this.iconsRevealPending = false;
                this.iconsPulseOnReveal = false;
            }
            return;
        }
        this.applyIconMaterialState(ViewController.ICON_LOCKED_STATE);
    }

    /** Called once the menu entrance finishes: locked stays locked; a queued
     *  reveal animates the lock open (with a scale pulse only for the first
     *  game); an already-revealed menu just settles unlocked. */
    private applyLockIconsAfterEntrance(): void {
        if (!this.firstGameUnlocked) {
            this.applyIconMaterialState(ViewController.ICON_LOCKED_STATE);
            return;
        }
        if (this.iconsRevealPending) {
            // The leaderboard hint pops over the menu after the first game; hold
            // the reveal (icons stay locked) until that popup is dismissed so the
            // unlock animation isn't hidden behind it.
            if (this.lbHintActive) {
                this.applyIconMaterialState(ViewController.ICON_LOCKED_STATE);
                return;
            }
            this.revealLockIconsNow();
            return;
        }
        this.applyIconMaterialState(ViewController.ICON_UNLOCKED_STATE);
    }

    /** Consume a queued reveal. First-game unlock (after leaderboard): smooth
     *  state transition + scale pulse. Returning players are handled instantly
     *  in prepareLockIconsForEntrance and should not reach here. */
    private revealLockIconsNow(): void {
        if (!this.iconsRevealPending) return;
        const withPulse = this.iconsPulseOnReveal;
        this.iconsRevealPending = false;
        this.iconsPulseOnReveal = false;
        if (withPulse) {
            this.animateIconState(ViewController.ICON_UNLOCKED_STATE);
            this.pulseLockIcons();
        } else {
            this.applyIconMaterialState(ViewController.ICON_UNLOCKED_STATE);
        }
    }

    private restoreIconRestTransforms(): void {
        if (this.loreIconTransform) {
            this.loreIconTransform.setLocalScale(this.loreIconBaseScale);
            this.loreIconTransform.setLocalRotation(this.loreIconBaseRotation);
        }
        if (this.archiveIconTransform) {
            this.archiveIconTransform.setLocalScale(this.archiveIconBaseScale);
            this.archiveIconTransform.setLocalRotation(this.archiveIconBaseRotation);
        }
    }

    private animateIconState(target: number, onDone?: () => void): void {
        this.stopIconStateAnim();
        if (!this.loreIcon && !this.archiveIcon) {
            if (onDone) onDone();
            return;
        }

        const start = this.iconStateValue;
        const duration = Math.max(0.01, ViewController.ICON_STATE_TRANSITION_SEC);
        const startTime = getTime();
        const ev = this.createEvent("UpdateEvent");
        this.iconStateAnimEvent = ev;

        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / duration, 1);
            const eased = this.easeInOutCubic(t);
            this.applyIconMaterialState(start + (target - start) * eased);
            if (t >= 1) {
                this.applyIconMaterialState(target);
                this.stopIconStateAnim();
                if (onDone) onDone();
            }
        });
    }

    private stopIconStateAnim(): void {
        if (this.iconStateAnimEvent) {
            this.iconStateAnimEvent.enabled = false;
            this.removeEvent(this.iconStateAnimEvent);
            this.iconStateAnimEvent = null;
        }
    }

    /** Smoothly bounce both icons (0.5 -> 0.6 -> 0.5) a couple of decaying times. */
    private pulseLockIcons(): void {
        this.stopIconPulse();
        if (!this.loreIconTransform && !this.archiveIconTransform) return;

        const duration = Math.max(0.01, ViewController.ICON_PULSE_SEC);
        const cycles = ViewController.ICON_PULSE_CYCLES;
        const peakMult = ViewController.ICON_PULSE_PEAK_MULT;
        const startTime = getTime();
        const ev = this.createEvent("UpdateEvent");
        this.iconPulseEvent = ev;

        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / duration, 1);
            const bump = (1 - Math.cos(2 * Math.PI * cycles * t)) * 0.5; // 0..1 bumps
            const decay = 1 - t; // shrink later bounces so it settles
            const mult = 1 + (peakMult - 1) * bump * decay;
            this.setIconPulseScale(mult);
            if (t >= 1) {
                this.setIconPulseScale(1);
                this.stopIconPulse();
            }
        });
    }

    private setIconPulseScale(mult: number): void {
        if (this.loreIconTransform) {
            const s = this.loreIconBaseScale;
            this.loreIconTransform.setLocalScale(new vec3(s.x * mult, s.y * mult, s.z * mult));
        }
        if (this.archiveIconTransform) {
            const s = this.archiveIconBaseScale;
            this.archiveIconTransform.setLocalScale(new vec3(s.x * mult, s.y * mult, s.z * mult));
        }
    }

    private stopIconPulse(): void {
        if (this.iconPulseEvent) {
            this.iconPulseEvent.enabled = false;
            this.removeEvent(this.iconPulseEvent);
            this.iconPulseEvent = null;
        }
    }

    /** A light, decaying Z-axis rotational shake when a locked button is tapped. */
    private shakeLockedIcon(id: MainMenuButtonId): void {
        const tr = id === "lore" ? this.loreIconTransform : this.archiveIconTransform;
        const baseRot = id === "lore" ? this.loreIconBaseRotation : this.archiveIconBaseRotation;
        if (!tr) return;

        this.stopIconShake(id);
        const duration = Math.max(0.01, ViewController.ICON_SHAKE_SEC);
        const amplitudeRad = ViewController.ICON_SHAKE_DEG * Math.PI / 180;
        const oscillations = ViewController.ICON_SHAKE_OSCILLATIONS;
        const startTime = getTime();
        const ev = this.createEvent("UpdateEvent");
        if (id === "lore") this.loreIconShakeEvent = ev;
        else this.archiveIconShakeEvent = ev;

        ev.bind(() => {
            const t = Math.min((getTime() - startTime) / duration, 1);
            const decay = 1 - t;
            const angle = amplitudeRad * decay * Math.sin(2 * Math.PI * oscillations * t);
            tr.setLocalRotation(baseRot.multiply(quat.fromEulerAngles(0, 0, angle)));
            if (t >= 1) {
                tr.setLocalRotation(baseRot);
                this.stopIconShake(id);
            }
        });
    }

    private stopIconShake(id: MainMenuButtonId): void {
        const ev = id === "lore" ? this.loreIconShakeEvent : this.archiveIconShakeEvent;
        if (!ev) return;
        ev.enabled = false;
        this.removeEvent(ev);
        if (id === "lore") this.loreIconShakeEvent = null;
        else this.archiveIconShakeEvent = null;
    }

    private easeBackOut(t: number, overshoot: number): number {
        const c1 = 1 + overshoot;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    private easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    private eulerZToQuat(deg: number): quat {
        return quat.fromEulerAngles(0, 0, deg * Math.PI / 180);
    }

    // Scale-down POI children (post-game cleanup)

    private scaleDownPoiChildrenThenClear(root: SceneObject, onDone?: () => void): void {
        const finish = (): void => { if (onDone) onDone(); };
        if (!root || !root.getChildrenCount) {
            global.utils.removeAllChildren(root);
            finish();
            return;
        }
        const count = root.getChildrenCount();
        if (count === 0) {
            global.utils.removeAllChildren(root);
            finish();
            return;
        }

        interface Entry { tr: Transform; base: vec3; }
        const entries: Entry[] = [];
        for (let i = 0; i < count; i++) {
            const child = root.getChild(i);
            if (!child || !child.getTransform) continue;
            const tr = child.getTransform();
            entries.push({ tr, base: tr.getWorldScale() });
        }
        if (!entries.length) {
            global.utils.removeAllChildren(root);
            finish();
            return;
        }

        const duration = 0.25;
        const overshoot = 0.12;
        let startTime = getTime();

        const animateEntryAt = (index: number): void => {
            if (index >= entries.length) {
                global.utils.removeAllChildren(root);
                finish();
                return;
            }
            const entry = entries[index];
            if (!entry || !entry.tr || !entry.base) {
                animateEntryAt(index + 1);
                return;
            }
            startTime = getTime();
            global.soundManager.playSound("synth", 1);

            const ev = this.createEvent("UpdateEvent");
            ev.bind(() => {
                const now = getTime();
                const k = (now - startTime) / duration;
                if (k < 0) return;
                if (k >= 1) {
                    entry.tr.setWorldScale(new vec3(0, 0, 0));
                    ev.enabled = false;
                    this.removeEvent(ev);
                    animateEntryAt(index + 1);
                    return;
                }
                const factor = (1 + overshoot * (1 - k)) * (1 - k);
                entry.tr.setWorldScale(new vec3(entry.base.x * factor, entry.base.y * factor, entry.base.z * factor));
            });
        };
        animateEntryAt(0);
    }
}
