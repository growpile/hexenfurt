// In-menu settings: volume, gloves visibility, local/cloud progress wipes.

const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const SliderModule = require("SpectaclesUIKit.lspkg/Scripts/Components/Slider/Slider");
const CapsuleButtonModule = require("SpectaclesUIKit.lspkg/Scripts/Components/Button/CapsuleButton");
const SLIDER_TYPE_NAME: string = SliderModule.Slider.getTypeName();
const CAPSULE_BUTTON_TYPE_NAME: string = CapsuleButtonModule.CapsuleButton.getTypeName();

const WIPE_CONFIRM_LABEL = "Confirm?";
const GLOVES_LABEL_ENABLED = "Gloves Enabled";
const GLOVES_LABEL_DISABLED = "Gloves Disabled";
const WIPE_LABEL_SWAP_DELAY_ID = "settings_wipe_label_swap";
const WIPE_CONFIRM_TIMEOUT_ID_PREFIX = "settings_wipe_confirm_timeout_";
const SPEAKER_STATE_DURATION_MS = 250;
const VOLUME_ZERO_EPSILON = 0.001;

type VolumeSliderApi = {
    initialized?: boolean;
    currentValue?: number;
    updateCurrentValue: (value: number, shouldAnimate?: boolean) => void;
    onValueChange?: { add: (fn: (value: number) => void) => void };
};

type CapsuleButtonApi = {
    setIsToggleable?: (toggle: boolean) => void;
    isOn?: boolean;
    onValueChange?: { add: (fn: (value: number) => void) => void };
    onTriggerUp?: { add: (fn: () => void) => void };
};

interface SupabaseWipeApi {
    tryDeleteOwnRecord(callback?: (ok: boolean) => void): void;
}

interface GameFlowGlovesApi {
    setUiGlovesEnabled(state: boolean): void;
}

interface GameFlowViewApi {
    viewController?: ScriptComponent;
}

interface ViewControllerLockApi {
    lockLoreArchiveMenus(): void;
}

type WipeKind = "local" | "cloud";

interface WipeButtonUi {
    kind: WipeKind;
    labelText: Text | null;
    baseLabel: string;
    awaitingConfirm: boolean;
    textTween: any;
}

@component
export class SettingsManager extends BaseScriptComponent {
    @ui.group_start("<span style='color: #60A5FA;'>Toggles</span>")
    @input
    @label("Gloves Toggle")
    @allowUndefined
    @hint("Toggleable CapsuleButton. Assign here only — no inspector callbacks (code listens via onValueChange).")
    public glovesToggle: ScriptComponent | null = null;

    @input
    @label("Gloves Scene Object")
    @allowUndefined
    @hint("Menu/settings gloves visual; enabled when the gloves toggle is on.")
    public glovesSceneObject: SceneObject | null = null;

    @input
    @allowUndefined
    @hint("Optional GameFlow component; syncs uiGloves[] when the toggle changes.")
    public gameFlow: ScriptComponent | null = null;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Actions</span>")
    @input
    @label("Wipe Local Progress")
    @allowUndefined
    @hint("CapsuleButton on Reset Local Progress. triggerUp → wipeLocalProgress().")
    public wipeLocalProgressButton: ScriptComponent | null = null;

    @input
    @label("Wipe Cloud Progress")
    @allowUndefined
    @hint("CapsuleButton on Reset Cloud Progress. triggerUp → wipeCloudProgress().")
    public wipeCloudProgressButton: ScriptComponent | null = null;

    @input
    @allowUndefined
    @hint("SupabaseTable component used for cloud wipe.")
    public supabaseTable: ScriptComponent | null = null;

    @input("float", "0.25")
    @hint("Seconds to fade wipe button label out/in when asking for confirm.")
    public wipeLabelFadeDuration: number = 0.25;

    @input("float", "3")
    @hint("Seconds to wait on Confirm? before reverting to the original label.")
    public wipeConfirmTimeoutSeconds: number = 3;
    @ui.group_end

    @ui.group_start("<span style='color: #60A5FA;'>Audio</span>")
    @input
    @label("Master Volume")
    @allowUndefined
    public masterVolumeSlider: ScriptComponent | null = null;

    @input
    @label("Speaker Material")
    @allowUndefined
    @hint("Speaker icon material; mainPass.state (shader State / Tweak_N10) 0 = audible, 1 = muted.")
    public speakerMaterial: Material | null = null;
    @ui.group_end

    private bindingsReady: boolean = false;
    private cloudWipeInFlight: boolean = false;
    private suppressGlovesToggleEvent: boolean = false;
    private glovesLabelText: Text | null = null;
    private glovesLabelEnabled: string = GLOVES_LABEL_ENABLED;
    private wipeUiLocal: WipeButtonUi | null = null;
    private wipeUiCloud: WipeButtonUi | null = null;
    private speakerStateTween: any = null;
    private volumeIsZero: boolean = false;
    private volumeSliderBound: boolean = false;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => this.bindControls());
    }

    /** Called when the settings panel finishes opening. */
    public refreshFromStorage(): void {
        this.resetWipeConfirmStates(false);
        this.applyPersistedSettings(false);
    }

    /** CapsuleButton triggerUp on Reset Local Progress (1st tap = Confirm?, 2nd = wipe). */
    public wipeLocalProgress(): void {
        this.handleWipePress("local");
    }

    /** CapsuleButton triggerUp on Reset Cloud Progress (1st tap = Confirm?, 2nd = wipe). */
    public wipeCloudProgress(): void {
        this.handleWipePress("cloud");
    }

    private bindControls(): void {
        if (this.bindingsReady) return;
        this.bindingsReady = true;

        this.wipeUiLocal = this.buildWipeButtonUi("local", this.wipeLocalProgressButton, "Reset Local Progress");
        this.wipeUiCloud = this.buildWipeButtonUi("cloud", this.wipeCloudProgressButton, "Reset Cloud Progress");

        this.captureGlovesToggleLabel();
        this.bindGlovesToggle();
        this.bindMasterVolumeSlider();
        this.applyPersistedSettings(true);
    }

    private captureGlovesToggleLabel(): void {
        if (!this.glovesToggle) return;
        const text = this.findLabelTextOnButton(this.glovesToggle.getSceneObject());
        if (!text) return;
        this.glovesLabelText = text;
        if (text.text && text.text.length > 0) {
            this.glovesLabelEnabled = text.text;
        }
    }

    private buildWipeButtonUi(
        kind: WipeKind,
        button: ScriptComponent | null,
        fallbackLabel: string
    ): WipeButtonUi | null {
        if (!button) return null;
        const labelText = this.findLabelTextOnButton(button.getSceneObject());
        const baseLabel = (labelText?.text && labelText.text.length > 0) ? labelText.text : fallbackLabel;
        return {
            kind,
            labelText,
            baseLabel,
            awaitingConfirm: false,
            textTween: null,
        };
    }

    private handleWipePress(kind: WipeKind): void {
        const ui = kind === "local" ? this.wipeUiLocal : this.wipeUiCloud;
        if (!ui) return;

        if (ui.awaitingConfirm) {
            this.cancelWipeConfirmTimeout(ui);
            ui.awaitingConfirm = false;
            this.clearOtherWipeConfirm(kind);
            this.executeWipe(kind, () => {
                this.transitionWipeLabel(ui, ui.baseLabel);
            });
            return;
        }

        this.clearOtherWipeConfirm(kind);
        ui.awaitingConfirm = true;
        this.transitionWipeLabel(ui, WIPE_CONFIRM_LABEL, () => {
            this.scheduleWipeConfirmTimeout(ui);
        });
    }

    private clearOtherWipeConfirm(activeKind: WipeKind): void {
        const other = activeKind === "local" ? this.wipeUiCloud : this.wipeUiLocal;
        if (!other?.awaitingConfirm) return;
        this.cancelWipeConfirmTimeout(other);
        other.awaitingConfirm = false;
        this.transitionWipeLabel(other, other.baseLabel);
    }

    private scheduleWipeConfirmTimeout(ui: WipeButtonUi): void {
        this.cancelWipeConfirmTimeout(ui);
        const seconds = Math.max(0.1, this.wipeConfirmTimeoutSeconds);
        global.utils.delay(WIPE_CONFIRM_TIMEOUT_ID_PREFIX + ui.kind, seconds, () => {
            if (!ui.awaitingConfirm) return;
            ui.awaitingConfirm = false;
            this.transitionWipeLabel(ui, ui.baseLabel);
        });
    }

    private cancelWipeConfirmTimeout(ui: WipeButtonUi): void {
        global.utils.invalidateDelay(WIPE_CONFIRM_TIMEOUT_ID_PREFIX + ui.kind);
    }

    private resetWipeConfirmStates(animate: boolean): void {
        this.resetOneWipeUi(this.wipeUiLocal, animate);
        this.resetOneWipeUi(this.wipeUiCloud, animate);
    }

    private resetOneWipeUi(ui: WipeButtonUi | null, animate: boolean): void {
        if (!ui) return;
        this.cancelWipeConfirmTimeout(ui);
        ui.awaitingConfirm = false;
        this.stopWipeLabelTween(ui);
        if (!ui.labelText) return;
        if (animate) {
            this.transitionWipeLabel(ui, ui.baseLabel);
            return;
        }
        ui.labelText.text = ui.baseLabel;
        this.setTextAlpha(ui.labelText, 1);
    }

    private lockLoreArchiveMenusAfterWipe(): void {
        const gf = this.gameFlow as unknown as GameFlowViewApi | null;
        const vc = gf?.viewController as unknown as ViewControllerLockApi | null;
        vc?.lockLoreArchiveMenus?.();
    }

    private executeWipe(kind: WipeKind, onDone?: () => void): void {
        if (kind === "local") {
            if (!global.persistentStorage?.wipeLocalProgress) {
                if (onDone) onDone();
                return;
            }
            global.persistentStorage.wipeLocalProgress();
            this.lockLoreArchiveMenusAfterWipe();
            if (onDone) onDone();
            return;
        }

        if (this.cloudWipeInFlight) return;
        const api = this.supabaseTable as unknown as SupabaseWipeApi | null;
        if (!api?.tryDeleteOwnRecord) {
            print("[SettingsManager] Cloud wipe unavailable (no SupabaseTable).");
            if (onDone) onDone();
            return;
        }
        this.cloudWipeInFlight = true;
        api.tryDeleteOwnRecord((ok) => {
            this.cloudWipeInFlight = false;
            print("[SettingsManager] Cloud wipe " + (ok ? "succeeded" : "failed") + ".");
            if (onDone) onDone();
        });
    }

    private transitionWipeLabel(ui: WipeButtonUi, newText: string, onDone?: () => void): void {
        if (!ui.labelText) {
            if (onDone) onDone();
            return;
        }

        this.stopWipeLabelTween(ui);
        const fadeMs = this.wipeLabelFadeMs();
        const hasVisibleText =
            (ui.labelText.text || "").length > 0 &&
            ui.labelText.textFill.color.a > 0.01;

        const fadeIn = (): void => {
            this.setTextAlpha(ui.labelText!, 0);
            ui.labelText!.text = newText;
            ui.textTween = LSTween.textAlphaFromTo(ui.labelText, 0, 1, fadeMs)
                .onComplete(() => {
                    ui.textTween = null;
                    if (onDone) onDone();
                })
                .start();
        };

        if (!hasVisibleText) {
            fadeIn();
            return;
        }

        ui.textTween = LSTween.textAlphaTo(ui.labelText, 0, fadeMs)
            .onComplete(() => {
                ui.textTween = null;
                global.utils.delay(WIPE_LABEL_SWAP_DELAY_ID + ui.kind, 0.05, fadeIn);
            })
            .start();
    }

    private stopWipeLabelTween(ui: WipeButtonUi): void {
        global.utils.invalidateDelay(WIPE_LABEL_SWAP_DELAY_ID + ui.kind);
        if (ui.textTween) {
            try {
                ui.textTween.stop();
            } catch (e) {}
            ui.textTween = null;
        }
    }

    private wipeLabelFadeMs(): number {
        return Math.max(1, this.wipeLabelFadeDuration * 1000);
    }

    private setTextAlpha(text: Text, alpha: number): void {
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

    private applyPersistedSettings(animateSlider: boolean): void {
        const ps = global.persistentStorage;
        if (!ps) return;

        const volume = ps.getMasterVolume();
        if (global.soundManager?.setMasterVolume) {
            global.soundManager.setMasterVolume(volume);
        }
        this.syncMasterVolumeSlider(volume, animateSlider);
        this.syncSpeakerMaterialState(volume, animateSlider);

        const glovesOn = ps.getGlovesEnabled();
        this.applyGlovesVisible(glovesOn);
        this.syncGlovesToggleUi(glovesOn);
        this.syncGlovesLabel(glovesOn);
    }

    private bindGlovesToggle(): void {
        const btn = this.getCapsuleButton(this.glovesToggle);
        if (!btn) return;

        if (typeof btn.setIsToggleable === "function") {
            btn.setIsToggleable(true);
        }

        if (btn.onValueChange && typeof btn.onValueChange.add === "function") {
            btn.onValueChange.add((value: number) => {
                if (this.suppressGlovesToggleEvent) return;
                this.persistGlovesEnabled(value > 0.5);
            });
        }
    }

    /**
     * Only if you are NOT using automatic binding: CapsuleButton onValueChange → this method.
     * Prefer assigning glovesToggle on SettingsManager and leaving callbacks empty.
     */
    public onGlovesToggleValue(value: number): void {
        if (this.suppressGlovesToggleEvent) return;
        this.persistGlovesEnabled(value > 0.5);
    }

    /**
     * Optional inspector callback: Volume Slider → On Value Changed → this method.
     * Code also binds slider.onValueChange in bindMasterVolumeSlider(); use one or the other.
     */
    public onMasterVolumeValue(value: number): void {
        this.handleMasterVolumeChange(value);
    }

    private bindMasterVolumeSlider(): void {
        this.waitForVolumeSliderReady(0);
    }

    private waitForVolumeSliderReady(attempt: number): void {
        const slider = this.getVolumeSlider();
        if (slider?.onValueChange?.add) {
            if (!this.volumeSliderBound) {
                this.volumeSliderBound = true;
                slider.onValueChange.add((value: number) => {
                    this.handleMasterVolumeChange(value);
                });
            }
            return;
        }

        if (attempt >= 80) {
            print("[SettingsManager] Master volume slider not found or not ready.");
            return;
        }

        const defer = this.createEvent("DelayedCallbackEvent");
        defer.bind(() => this.waitForVolumeSliderReady(attempt + 1));
        defer.reset(0.05);
    }

    private handleMasterVolumeChange(value: number): void {
        const clamped = Math.min(1, Math.max(0, value));
        if (global.persistentStorage?.setMasterVolume) {
            global.persistentStorage.setMasterVolume(clamped);
        }
        if (global.soundManager?.setMasterVolume) {
            global.soundManager.setMasterVolume(clamped);
        }
        this.syncSpeakerMaterialState(clamped, true);
    }

    private getSpeakerPass(): Pass | null {
        if (!this.speakerMaterial) return null;
        return this.speakerMaterial.mainPass;
    }

    private getSpeakerState(): number {
        const pass = this.getSpeakerPass();
        if (!pass) return 0;
        const state = (pass as any).state;
        return typeof state === "number" ? state : 0;
    }

    private setSpeakerState(value: number): void {
        const pass = this.getSpeakerPass();
        if (!pass) return;
        (pass as any).state = value;
    }

    private syncSpeakerMaterialState(volume: number, animate: boolean): void {
        if (!this.speakerMaterial) return;

        const atZero = volume <= VOLUME_ZERO_EPSILON;
        if (!animate) {
            this.stopSpeakerStateTween();
            this.volumeIsZero = atZero;
            this.setSpeakerState(atZero ? 1 : 0);
            return;
        }

        if (atZero === this.volumeIsZero) return;
        this.volumeIsZero = atZero;
        this.animateSpeakerState(atZero ? 1 : 0);
    }

    private animateSpeakerState(to: number): void {
        if (!this.speakerMaterial) return;

        this.stopSpeakerStateTween();
        const from = this.getSpeakerState();
        if (Math.abs(from - to) < 0.001) {
            this.setSpeakerState(to);
            return;
        }

        this.speakerStateTween = LSTween.rawTween(SPEAKER_STATE_DURATION_MS)
            .onUpdate((obj: { t: number }) => {
                this.setSpeakerState(from + (to - from) * obj.t);
            })
            .onComplete(() => {
                this.speakerStateTween = null;
                this.setSpeakerState(to);
            })
            .start();
    }

    private stopSpeakerStateTween(): void {
        if (!this.speakerStateTween) return;
        try {
            this.speakerStateTween.stop();
        } catch (e) {}
        this.speakerStateTween = null;
    }

    private persistGlovesEnabled(enabled: boolean): void {
        if (global.persistentStorage?.setGlovesEnabled) {
            global.persistentStorage.setGlovesEnabled(enabled);
        }
        this.applyGlovesVisible(enabled);
        this.syncGlovesLabel(enabled);
    }

    private syncGlovesLabel(enabled: boolean): void {
        if (!this.glovesLabelText) return;
        this.glovesLabelText.text = enabled ? this.glovesLabelEnabled : GLOVES_LABEL_DISABLED;
    }

    private applyGlovesVisible(enabled: boolean): void {
        if (this.glovesSceneObject) {
            this.glovesSceneObject.enabled = enabled;
        }
        const gf = this.gameFlow as unknown as GameFlowGlovesApi | null;
        if (gf?.setUiGlovesEnabled) {
            gf.setUiGlovesEnabled(enabled);
        }
    }

    private syncGlovesToggleUi(enabled: boolean): void {
        const btn = this.getCapsuleButton(this.glovesToggle);
        if (!btn) return;
        if (typeof btn.isOn === "undefined") return;
        this.suppressGlovesToggleEvent = true;
        btn.isOn = enabled;
        this.suppressGlovesToggleEvent = false;
    }

    private syncMasterVolumeSlider(volume: number, shouldAnimate: boolean): void {
        const slider = this.getVolumeSlider();
        if (!slider) return;
        slider.updateCurrentValue(Math.min(1, Math.max(0, volume)), shouldAnimate);
    }

    private getCapsuleButton(input: ScriptComponent | null): CapsuleButtonApi | null {
        if (!input) return null;
        const so = input.getSceneObject();
        const comp = (so as any).getComponent(CAPSULE_BUTTON_TYPE_NAME);
        if (comp) return comp as CapsuleButtonApi;
        return input as unknown as CapsuleButtonApi;
    }

    private getVolumeSlider(): VolumeSliderApi | null {
        if (!this.masterVolumeSlider) return null;

        const direct = this.masterVolumeSlider as unknown as VolumeSliderApi;
        if (direct?.onValueChange?.add) {
            return direct;
        }

        const so = this.masterVolumeSlider.getSceneObject();
        const comp = (so as any).getComponent(SLIDER_TYPE_NAME);
        if (comp) return comp as VolumeSliderApi;
        return null;
    }
}
