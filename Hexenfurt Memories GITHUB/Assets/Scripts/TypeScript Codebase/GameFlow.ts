// Core game flow: the phase state machine, hint system, ambient creak loop,
// intro sequence, escape timer, simulator setup, and the post-game pivot when
// the escape door opens. Room spawning lives in ProceduralRoom.

const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

const InteractionHintModule = require("Addons/Spectacles3DHandHints.lspkg/Scripts/InteractionHintController");
const { HandMode, HandAnimationsLibrary } = InteractionHintModule;

const sikModule = require("SpectaclesInteractionKit.lspkg/SIK");
const SIK = sikModule.SIK || sikModule.default || sikModule;
const InteractorTriggerType = require("SpectaclesInteractionKit.lspkg/Core/Interactor/Interactor").InteractorTriggerType;

/** Phase ordinals exactly match the original `currentPhase` integers so
 *  existing scripts that read `logic.currentPhase` (e.g. HandMenu) keep
 *  working. */
export const enum Phase {
    Idle = 0,
    EyeHeight = 1,
    GroundHeight = 2,
    ExitDoor = 3,
    POIAnchors = 4,
    Loading = 5,
    Game = 6,
    PostGame = 7,
}

const PHASE_VIEWS = ["menuView", "setupView", "setupView", "setupView", "setupView", "gameView"];

const HINTS: { [id: string]: string } = {
    lockedChest: "Hmm. Looks like the chest is locked.",
    lockedDoor: "I wonder who locked the door?",
    lockedKeySafe: "It's locked. Maybe I can find the key.",
    lockedCodeSafe: "What could the combination be?",
    lockedBookshelfDrawer: "I'm not sure how to open this.",
    lockedClockDrawer: "It's locked. Doesn't seem like it has a key.",
    addedLore: "Lore piece added to Archive.",
    seenLore: "I've already seen this.",
    addedNote: "Interesting note. I will write that down.",
    added_bronzeKey: "A bronze key! What could it open?",
    added_silverKey: "A silver key... must open something important.",
    added_goldKey: "A gold key? This one feels special.",
    openInventoryHint: "Open the Inventory by looking at your right palm.",
};

interface ViewControllerAdapter {
    transitionTo(toId: string, durationSec?: number, onDone?: () => void): void;
    proceedTap(): void;
    recordedData(): void;
    removedAnchor(): void;
    doorOpened(escapeDoor: SceneObject, escapeTime: string, isPersonalBest: boolean): void;
    introDone(): void;
    refreshFirstGameState(played: boolean): void;
    updateAnchorRequirementsHint(): void;
    unlockArchive(): void;
    lockLoreArchiveMenus(): void;
}

interface WorldQueryAdapter {
    eyeHeight: number | null;
    groundHeight: number | null;
    exitDoor: HexenfurtExitDoor | null;
    anchorVisualsRoot: SceneObject;
    reset(): void;
    stopRecording(): void;
    recordEyeHeight(cb: () => void): void;
    recordGroundHeight(cb: () => void): void;
    recordDoorSurfaceAnchor(cb: () => void): void;
    recordPOISurfaceAnchors(cb: () => void): void;
    manuallySnapCurrentScan(cb?: () => void): void;
    checkAnchorsNeededAlt(): boolean;
    checkAnchorsNeeded(): string;
}

interface InteractionHintAdapter {
    playHintAnimation(mode: any, animation: any, repeats: number, delay: number): void;
}

interface SupabaseAdapter {
    tryUpdateScore(score: number | string, rounds: number, callback?: (ok: boolean) => void): void;
}

interface ProceduralRoomAdapter {
    setupProceduralGame(): void;
}

@component
export class GameFlow extends BaseScriptComponent {
    @ui.group_start("<span style='color: #60A5FA;'>Core Systems</span>")
    @input
    public worldQueryManager!: ScriptComponent;

    @input
    public viewController!: ScriptComponent;

    @input
    public proceduralRoom!: ScriptComponent;

    @input
    public interactionHintController!: ScriptComponent;

    @input
    public supabaseTable!: ScriptComponent;

    @input
    public poiRoot!: SceneObject;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Interactors</span>")
    @input
    public handInteractors: ScriptComponent[] = [];

    @input
    public mouseInteractor!: ScriptComponent;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Inventory UI</span>")
    @input
    @hint("Optional inventory gloves visualizers, hidden when entering the menu state.")
    public uiGloves: SceneObject[] = [];
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Setup Phases</span>")
    @input
    @hint("Phase instruction line during eye height / ground / door / anchor setup.")
    public descriptionText!: Text;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Intro Sequence</span>")
    @input
    public introRoot!: SceneObject;

    @input
    public introLabel!: Text;

    @input
    public introLogoMaterial!: Material;

    @input
    public introTableHint!: Text;

    @input
    public introSkipHint!: Text;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Gameplay Hints</span>")
    @input
    public textOccluder!: Material;

    @input
    public hintTextComponent!: Text;

    @input
    public typewriterDuration: number = 0.5;

    @input
    public occluderShowAlpha: number = 0.7;

    @input
    public hintDisplayTime: number = 1.0;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Ambient Creaks</span>")
    @input
    public creakCamera!: SceneObject;

    @input
    public creakSurrounds: SceneObject[] = [];
    @ui.group_end

    /** Mutated by `ViewController.proceedTap()` to advance the phase. */
    public currentPhase: number = Phase.Idle;
    /** True only after story intro finishes (or is skipped) and gameplay begins. */
    public gameplayStarted: boolean = false;
    public isUsingEditorSetup: boolean = false;
    public roomAlreadyScanned: boolean = false;

    private hintQueue: string[] = [];
    private currentHintId: string | null = null;
    private hintState: "idle" | "typingIn" | "holding" | "typingOut" = "idle";
    private occluderTween: any = null;
    private typewriterTween: any = null;

    private creakLastPos!: vec3;
    private creakTimePassed: number = 0;

    private runTimer: { isRunning: boolean; t0: number } = { isRunning: false, t0: 0 };

    private introSkipped: boolean = false;
    private introCompleted: boolean = false;
    private skipTweenPlayed: boolean = false;
    private airPinchCount: number = 0;
    private introSkipEvent: SceneEvent | null = null;

    onAwake(): void {
        // Bind hint system once globals are set up by the dependency scripts.
        global.hintSystem = {
            showHint: (id) => this.showHint(id),
            clearQueue: () => { this.hintQueue.length = 0; },
            isBusy: () => this.hintState !== "idle",
            currentHintId: () => this.currentHintId,
        };

        // Timer helpers exposed on global for SupabaseTable and others.
        global.startTimer = () => this.startTimer();
        global.endTimer = () => this.endTimer();
        global.peekTimer = () => this.peekTimer();
        global.resetTimer = () => this.resetTimer();

        // Expose the cross-script entry points other components call through global.
        global.removedAnchor = () => {
            (this.viewController as unknown as ViewControllerAdapter).removedAnchor();
            this.updateAnchorRequirementsHint();
        };
        global.doorOpened = (door) => this.onDoorOpened(door);

        this.createEvent("OnStartEvent").bind(() => this.onStart());
    }

    private onStart(): void {
        // Initial occluder alpha + empty hint string
        const initColor = this.textOccluder.mainPass.baseColor;
        initColor.a = 0;
        this.textOccluder.mainPass.baseColor = initColor;
        this.hintTextComponent.text = "";

        // Creak ambient
        this.creakLastPos = this.creakCamera.getTransform().getWorldPosition();
        const creakUpdate = this.createEvent("UpdateEvent");
        creakUpdate.bind((eventData) => this.tickCreak(eventData));

        // Intro skip air-pinch listener (self-disables once the intro ends).
        const introUpdate = this.createEvent("UpdateEvent");
        this.introSkipEvent = introUpdate;
        introUpdate.bind(() => this.checkAirPinchSkip());

        // Run intro tween chain
        this.introLogoSequence();

        const played = global.persistentStorage.hasPlayedFirstGame();
        print("Has user done a game: " + played);
        (this.viewController as unknown as ViewControllerAdapter).refreshFirstGameState(played);
    }

    // Phase machine

    public nextPhase(): void {
        this.wqm().stopRecording();
        this.currentPhase++;
        print("Entered phase: " + this.currentPhase + ", " + PHASE_VIEWS[this.currentPhase]);

        switch (this.currentPhase) {
            case Phase.EyeHeight:
                (this.interactionHintController as unknown as InteractionHintAdapter)
                    .playHintAnimation(HandMode.Right, HandAnimationsLibrary.Right.PinchFar, 2, 2.5);
                this.descriptionText.text = "Stand up naturally and pinch anywhere to capture your eye height.";
                this.wqm().recordEyeHeight(() => this.eyeLevelCaptured());
                break;
            case Phase.GroundHeight:
                this.descriptionText.text = "Look at the floor and pinch anywhere to capture ground level.";
                this.wqm().recordGroundHeight(() => this.groundLevelCaptured());
                break;
            case Phase.ExitDoor:
                this.descriptionText.text = "Look at a wall and pinch anywhere to place the Escape Door.";
                this.wqm().recordDoorSurfaceAnchor(() => this.doorPositionCaptured());
                break;
            case Phase.POIAnchors:
                this.descriptionText.text = "Look around and place anchors for the required surfaces by pinching.";
                this.updateAnchorRequirementsHint();
                this.wqm().recordPOISurfaceAnchors(() => this.poisCaptured());
                break;
            default:
                break;
        }
    }

    public returnNextPhaseView(): string {
        return PHASE_VIEWS[this.currentPhase + 1] ?? "menuView";
    }

    public checkCurrentPhaseData(callbackIfHas?: () => void): boolean {
        const wqm = this.wqm();
        switch (this.currentPhase) {
            case Phase.EyeHeight:    if (wqm.eyeHeight != null)       { callbackIfHas?.(); return true; } break;
            case Phase.GroundHeight: if (wqm.groundHeight != null)    { callbackIfHas?.(); return true; } break;
            case Phase.ExitDoor:     if (wqm.exitDoor != null)        { callbackIfHas?.(); return true; } break;
            case Phase.POIAnchors:   if (wqm.checkAnchorsNeededAlt()) { callbackIfHas?.(); return true; } break;
        }
        return false;
    }

    public recordTap(): void {
        let phaseCb: (() => void) | null = null;
        switch (this.currentPhase) {
            case Phase.EyeHeight:    phaseCb = () => this.eyeLevelCaptured();   break;
            case Phase.GroundHeight: phaseCb = () => this.groundLevelCaptured(); break;
            case Phase.ExitDoor:     phaseCb = () => this.doorPositionCaptured(); break;
            case Phase.POIAnchors:   phaseCb = () => this.poisCaptured(); break;
        }
        this.wqm().manuallySnapCurrentScan(phaseCb ?? undefined);
    }

    public updateAnchorRequirementsHint = (): void => {
        (this.viewController as unknown as ViewControllerAdapter).updateAnchorRequirementsHint();
    };

    public setupProceduralGame(): void {
        this.resetGameplaySession();
        (this.proceduralRoom as unknown as ProceduralRoomAdapter).setupProceduralGame();
    }

    public cleanWQM(): void {
        this.wqm().reset();
    }

    public enableInteractors(state: boolean): void {
        const value = state ? 500 : 0;
        if (this.handInteractors[0]) (this.handInteractors[0] as any).setMaxRayDistance(value);
        if (this.handInteractors[1]) (this.handInteractors[1] as any).setMaxRayDistance(value);
        if (this.mouseInteractor) (this.mouseInteractor as any).setMaxRayDistance(value);
    }

    public setUiGlovesEnabled(state: boolean): void {
        if (this.uiGloves[0]) this.uiGloves[0].enabled = state;
        if (this.uiGloves[1]) this.uiGloves[1].enabled = state;
    }

    public simulatorSetup(): void {
        const ESCAPE_DOOR: HexenfurtExitDoor = {
            position: new vec3(-284.501, -179.093, -400.461),
            normal: new vec3(0.9999935626983643, -0.000025391578674316406, 0.0036014914512634277),
        };
        const EYE_HEIGHT = 0;
        const GROUND_HEIGHT = -179.443;

        global.surfaceAnchors = [
            { surfaceType: "wall",    position: new vec3(-166.8561, -20, -503.5013),         normal: new vec3(0, 0, 1) },
            { surfaceType: "ground",  position: new vec3(-216.0770, -178.96, -264.4082),     yaw: 0.97 },
            { surfaceType: "wall",    position: new vec3(-271.1248, -20, -114.1625),         normal: new vec3(1, 0, 0) },
            { surfaceType: "ground",  position: new vec3(-27.0081, -179.0913, -402.7913),    yaw: -0.11 },
            { surfaceType: "ceiling", position: new vec3(-105.0950, 121.1133, -350.5643),    yaw: 0.41 },
        ];

        const wqm = this.wqm();
        wqm.groundHeight = GROUND_HEIGHT;
        global.groundHeight = GROUND_HEIGHT;
        wqm.eyeHeight = EYE_HEIGHT;
        wqm.exitDoor = ESCAPE_DOOR;

        this.isUsingEditorSetup = true;
        this.currentPhase = Phase.POIAnchors;
        (this.viewController as unknown as ViewControllerAdapter).proceedTap();
    }

    private eyeLevelCaptured(): void {
        print("Eye Level Recorded!");
        (this.interactionHintController as unknown as InteractionHintAdapter)
            .playHintAnimation(HandMode.Right, HandAnimationsLibrary.Right.PinchFar, 2, 0.3);
        this.descriptionText.text =
            "Stand up naturally and pinch anywhere to capture your eye height.\n\n HOLD pinch to continue setup.";
        (this.viewController as unknown as ViewControllerAdapter).recordedData();
    }

    private groundLevelCaptured(): void {
        print("Ground Level Recorded!");
        this.descriptionText.text =
            "Look at the floor and pinch anywhere to capture ground level.\n\n HOLD pinch to continue setup.";
        (this.viewController as unknown as ViewControllerAdapter).recordedData();
    }

    private doorPositionCaptured(): void {
        print("Door Position Recorded!");
        this.descriptionText.text =
            "Look at a wall and pinch anywhere to place the Escape Door.\n\n HOLD pinch to continue setup.";
        (this.viewController as unknown as ViewControllerAdapter).recordedData();
    }

    private poisCaptured(): void {
        print("Anchors Recorded!");
        this.descriptionText.text =
            "Look around and place anchors for the required surfaces by pinching.\n\n HOLD pinch to begin your story.";
        (this.viewController as unknown as ViewControllerAdapter).recordedData();
    }

    // Hint system (text + occluder)

    private stopTween(t: any): void { if (t) t.stop(); }

    private fadeOccluder(toAlpha: number, durationSec: number, onDone?: () => void): void {
        this.stopTween(this.occluderTween);
        this.occluderTween = LSTween.alphaTo(this.textOccluder, toAlpha, durationSec * 1000);
        if (onDone) this.occluderTween.onComplete(onDone);
        this.occluderTween.start();
    }

    private typewriterIn(text: string, durationSec: number, onDone?: () => void): void {
        this.stopTween(this.typewriterTween);
        this.hintTextComponent.text = "";
        const len = text.length;
        this.typewriterTween = LSTween.rawTween(durationSec * 1000)
            .onUpdate((obj: { t: number }) => {
                this.hintTextComponent.text = text.substr(0, Math.floor(obj.t * len));
            })
            .onComplete(() => {
                this.hintTextComponent.text = text;
                if (onDone) onDone();
            });
        this.typewriterTween.start();
    }

    private typewriterOut(durationSec: number, onDone?: () => void): void {
        this.stopTween(this.typewriterTween);
        const startText = this.hintTextComponent.text || "";
        const len = startText.length;
        this.typewriterTween = LSTween.rawTween(durationSec * 1000)
            .onUpdate((obj: { t: number }) => {
                this.hintTextComponent.text = startText.substr(0, Math.max(0, len - Math.floor(len * obj.t)));
            })
            .onComplete(() => {
                this.hintTextComponent.text = "";
                if (onDone) onDone();
            });
        this.typewriterTween.start();
    }

    private processNextHint(): void {
        if (this.hintState !== "idle") return;
        if (this.hintQueue.length === 0) {
            this.fadeOccluder(0.0, this.typewriterDuration);
            if (this.hintTextComponent.text && this.hintTextComponent.text.length > 0) {
                this.typewriterOut(this.typewriterDuration);
            }
            return;
        }
        const next = this.hintQueue.shift();
        if (next) this.showOneHint(next);
    }

    private showOneHint(hintId: string): void {
        this.currentHintId = hintId;
        this.hintState = "typingIn";

        let text = HINTS[hintId];
        if (text === undefined) text = "[" + hintId + "]";

        this.fadeOccluder(this.occluderShowAlpha, this.typewriterDuration);
        this.typewriterIn(text, this.typewriterDuration, () => {
            this.hintState = "holding";
            global.utils.delay(this.hintDisplayTime, () => {
                this.hintState = "typingOut";
                this.fadeOccluder(0.0, this.typewriterDuration);
                this.typewriterOut(this.typewriterDuration, () => {
                    this.currentHintId = null;
                    this.hintState = "idle";
                    this.processNextHint();
                });
            });
        });
    }

    private showHint(hintId: string): void {
        print("Showing hint: " + hintId);
        if (this.currentHintId === hintId && this.hintState !== "idle") return;
        if (this.hintState === "idle") {
            this.showOneHint(hintId);
        } else {
            this.hintQueue.push(hintId);
        }
    }

    // Creak ambient

    private tickCreak(eventData: UpdateEvent): void {
        this.creakTimePassed += eventData.getDeltaTime();
        const CHECK_INTERVAL = 5.0;
        const MOVE_THRESHOLD = 25.0;
        if (this.creakTimePassed >= CHECK_INTERVAL) {
            this.creakTimePassed = 0;
            const currentPos = this.creakCamera.getTransform().getWorldPosition();
            if (currentPos.distance(this.creakLastPos) >= MOVE_THRESHOLD) {
                if (Math.random() < 0.5 && this.creakSurrounds.length && global.soundManager && global.utils) {
                    const parent = this.creakSurrounds[global.utils.rng(0, this.creakSurrounds.length - 1)];
                    global.soundManager.playSpatialSound(parent, "creak" + global.utils.rng(1, 6), 1, 1);
                }
            }
            this.creakLastPos = currentPos;
        }
    }

    // Timer

    private startTimer(): void { this.runTimer.t0 = getTime(); this.runTimer.isRunning = true; }
    private endTimer(): number {
        const elapsed = this.runTimer.isRunning ? (getTime() - this.runTimer.t0) : 0;
        this.runTimer.isRunning = false;
        return elapsed;
    }
    private peekTimer(): number { return this.runTimer.isRunning ? (getTime() - this.runTimer.t0) : 0; }
    private resetTimer(): void { this.runTimer.isRunning = false; this.runTimer.t0 = 0; }

    /** Called when loading/spawn begins — timer and hand menu stay off until `beginGameplay`. */
    public resetGameplaySession(): void {
        this.gameplayStarted = false;
        this.resetTimer();
    }

    /** Starts the escape timer, enables interaction, and opens the game phase (phase 6). */
    public beginGameplay(): void {
        this.enableInteractors(true);
        this.currentPhase = Phase.Game;
        this.gameplayStarted = true;
        if (global.persistentStorage) global.persistentStorage.increaseStat("roundPlayed");
        this.resetTimer();
        this.startTimer();
        this.setUiGlovesEnabled(false);
    }

    public startGameTimer(): void { this.startTimer(); }

    // Door opened (post-game pivot)

    private onDoorOpened(doorSceneObject: SceneObject): void {
        this.setUiGlovesEnabled(true);
        this.gameplayStarted = false;

        const escapeTimeNum = this.endTimer();
        const escapeTime = escapeTimeNum.toFixed(2);
        const escapeSeconds = parseFloat(escapeTime);

        global.persistentStorage.markFirstGamePlayed();
        global.persistentStorage.addArchiveObjectSeen("door");
        (this.viewController as unknown as ViewControllerAdapter).unlockArchive();

        const rounds = global.persistentStorage.getStat("roundPlayed") ?? 0;

        // Decide personal-best explicitly against the previous stored value so a
        // tie isn't counted as a new best, then commit the new best before the
        // (async) Supabase write reads it.
        const previousBest = global.persistentStorage.getStat("fastestEscape") ?? 0;
        const isPersonalBest = previousBest <= 0 || (escapeSeconds > 0 && escapeSeconds < previousBest);
        global.persistentStorage.updateFastestEscapeIfBetter(escapeSeconds);

        (this.supabaseTable as unknown as SupabaseAdapter).tryUpdateScore(escapeTime, rounds, (ok) => {
            if (ok) print("Score Written");
            else print("Score Failed");
        });

        this.currentPhase = Phase.PostGame;
        (this.viewController as unknown as ViewControllerAdapter).doorOpened(doorSceneObject, escapeTime, isPersonalBest);
    }

    // Intro sequence (logo fade + skip)

    private scaleDownIntro(callback: () => void): void {
        const t = this.introRoot.getTransform();
        LSTween.scaleFromToLocal(t, t.getLocalScale(), vec3.zero(), 250)
            .easing(Easing.Back.In)
            .onComplete(callback)
            .start();
    }

    private introLogoSequence(): void {
        if (this.introSkipped) return;

        LSTween.textAlphaFromTo(this.introLabel, 0, 1, 2000)
            .easing(Easing.Circular.In)
            .start();

        global.utils.delay(1, () => {
            if (this.introSkipped) return;
            LSTween.alphaFromTo(this.introLogoMaterial, 0, 1, 2000)
                .easing(Easing.Circular.In)
                .start();

            global.utils.delay(3, () => {
                if (this.introSkipped) return;
                LSTween.textAlphaTo(this.introLabel, 0, 1000).easing(Easing.Circular.Out).start();
                LSTween.alphaTo(this.introLogoMaterial, 0, 1000)
                    .easing(Easing.Circular.Out)
                    .delay(500)
                    .onComplete(() => {
                        if (this.introSkipped) return;
                        global.utils.delay(0.25, () => {
                            if (this.introSkipped) return;
                            LSTween.textAlphaFromTo(this.introTableHint, 0, 1, 1000)
                                .easing(Easing.Circular.In)
                                .onComplete(() => {
                                    if (this.introSkipped) return;
                                    global.utils.delay(1, () => {
                                        if (this.introSkipped) return;
                                        this.scaleDownIntro(() => {
                                            if (this.introSkipped) return;
                                            this.introCompleted = true;
                                            (this.viewController as unknown as ViewControllerAdapter).introDone();
                                        });
                                    });
                                })
                                .start();
                        });
                    })
                    .start();
            });
        });
    }

    private skipIntro(): void {
        if (this.introSkipped || this.introCompleted) return;
        this.introSkipped = true;
        this.scaleDownIntro(() => {
            this.introCompleted = true;
            (this.viewController as unknown as ViewControllerAdapter).introDone();
        });
    }

    private checkAirPinchSkip(): void {
        if (this.introSkipped || this.introCompleted) {
            // Intro is over: stop the per-frame listener and free the event.
            if (this.introSkipEvent) {
                this.introSkipEvent.enabled = false;
                this.removeEvent(this.introSkipEvent);
                this.introSkipEvent = null;
            }
            return;
        }
        const interactors: any[] = SIK.InteractionManager.getTargetingInteractors();
        if (!interactors || interactors.length === 0) return;
        for (let i = 0; i < interactors.length; i++) {
            const interactor = interactors[i];
            if (!interactor) continue;
            if (interactor.previousTrigger === InteractorTriggerType.None &&
                interactor.currentTrigger !== InteractorTriggerType.None) {
                const hitInfo = interactor.targetHitInfo;
                const hasTarget = hitInfo && hitInfo.hit && hitInfo.hit.collider;
                if (!hasTarget) {
                    this.airPinchCount++;
                    if (this.airPinchCount === 1 && !this.skipTweenPlayed) {
                        this.skipTweenPlayed = true;
                        LSTween.textAlphaFromTo(this.introSkipHint, 0, 1, 250)
                            .easing(Easing.Circular.In)
                            .start();
                    } else if (this.airPinchCount >= 2) {
                        this.skipIntro();
                    }
                    return;
                }
            }
        }
    }

    private wqm(): WorldQueryAdapter {
        return this.worldQueryManager as unknown as WorldQueryAdapter;
    }
}
