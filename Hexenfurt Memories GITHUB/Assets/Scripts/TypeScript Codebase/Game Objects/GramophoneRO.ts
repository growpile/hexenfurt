// Gramophone hint decoration. `ProceduralRoom` calls `configure()` when the
// gramophone deco spawns, handing it the chain's entry combination (shown on a
// physical note) and the first solution combination (played as a looping digit
// sequence). Plays a music loop alongside the sequence and tears both down on
// destroy so audio never outlives the room.

import { ItemSpot } from "./ItemSpot";

const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;

interface NoteSlotScript {
    isNote?: boolean;
    noteTextComponent?: Text;
}

let gramophoneSeqCounter = 0;

@component
export class GramophoneRO extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Audio</font>"}
    @input
    @label("Music Loop Sound ID")
    public musicLoopSoundId: string = "";

    @input("float", "1.0")
    @widget(new SliderWidget(0.0, 1.0, 0.01))
    @label("Music Volume")
    public musicVolume: number = 1.0;

    @input
    @label("Number Sound IDs (0–9)")
    @hint("Index 0 = digit 0, index 9 = digit 9. Each id must exist in SoundManager spatial sound list.")
    public numberSoundIds: string[] = [];

    @input("float", "1.0")
    @widget(new SliderWidget(0.0, 1.0, 0.01))
    @label("Digit Volume")
    public digitVolume: number = 1.0;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Hint Text</font>"}
    @input
    @label("Hint Text Scene Object")
    @allowUndefined
    @hint("Floated digit label shown while each number sound plays: moves local Z 10→30, scales 0→1, fades in/out.")
    public hintTextObject: SceneObject | null = null;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Entry Note</font>"}
    @input
    @allowUndefined
    public notePickupPrefab: ObjectPrefab | null = null;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Item Spots</font>"}
    @input
    @label("Spots")
    public itemSpots: ItemSpot[] = [];
    // @ui {"widget":"group_end"}

    private static readonly DIGIT_STEP_SEC = 3;
    private static readonly REPEAT_PAUSE_SEC = 6;
    private static readonly HINT_START_LOCAL = new vec3(0, 0, 10);
    private static readonly HINT_END_LOCAL = new vec3(0, 0, 30);
    private static readonly HINT_ANIM_SEC = 2.4;
    private static readonly HINT_FADE_IN_PORTION = 0.22;
    private static readonly HINT_FADE_OUT_PORTION = 0.22;

    private configured: boolean = false;
    private running: boolean = false;
    private solutionDigits: string = "";
    private seqId: string = "";
    private hintTextTransform: Transform | null = null;
    private hintText: Text | null = null;
    private hintTextResolved: boolean = false;
    private hintTextTween: any = null;

    onAwake(): void {
        this.seqId = "gramophoneSeq_" + gramophoneSeqCounter++;
        this.createEvent("OnDestroyEvent").bind(() => this.teardown());
    }

    /** Called once by `ProceduralRoom`. Music loop always plays (if configured).
     * `entryCombination`: optional note shown beside the gramophone (skipped when
     * empty). `solutionCombination`: the code played as a looping digit-audio
     * sequence (skipped when empty). Both empty = ambient music only. */
    public configure = (entryCombination: string, solutionCombination: string): void => {
        if (this.configured) return;
        this.configured = true;

        this.spawnEntryNote(entryCombination || "");

        if (this.musicLoopSoundId) {
            const vol = Math.min(1, Math.max(0, this.musicVolume));
            global.soundManager.playSpatialSound(this.getSceneObject(), this.musicLoopSoundId, vol, -1);
        }

        this.prepareHintTextHidden();

        this.solutionDigits = solutionCombination || "";
        if (this.solutionDigits.length > 0) {
            this.running = true;
            this.playDigit(0);
        }
    };

    private spawnEntryNote(entryCombination: string): void {
        if (!entryCombination) return;
        if (!this.notePickupPrefab) return;
        const spot = this.pickNoteSpot();
        if (!spot || !spot.origin) return;

        const so = this.notePickupPrefab.instantiate(spot.origin);
        so.getTransform().setLocalPosition(vec3.zero());
        so.getTransform().setLocalScale(new vec3(1, 1, 1));

        const sc = so.getComponent("Component.ScriptComponent") as unknown as NoteSlotScript | null;
        if (sc) {
            if (typeof sc.isNote !== "undefined") sc.isNote = true;
            if (sc.noteTextComponent && typeof sc.noteTextComponent.text !== "undefined") {
                sc.noteTextComponent.text = entryCombination;
            }
        }
    }

    private pickNoteSpot(): ItemSpot | null {
        for (let i = 0; i < this.itemSpots.length; i++) {
            const sp = this.itemSpots[i];
            if (sp && sp.orientation === 0 && (sp.objectType === "item" || sp.objectType === "both")) {
                return sp;
            }
        }
        return this.itemSpots.length > 0 ? this.itemSpots[0] : null;
    }

    private playDigit(index: number): void {
        if (!this.running) return;
        const digits = this.solutionDigits;
        if (digits.length === 0) return;

        this.playDigitSound(digits.charAt(index));

        const isLast = index >= digits.length - 1;
        const nextDelay = isLast ? GramophoneRO.REPEAT_PAUSE_SEC : GramophoneRO.DIGIT_STEP_SEC;
        const nextIndex = isLast ? 0 : index + 1;
        global.utils.delay(this.seqId, nextDelay, () => this.playDigit(nextIndex));
    }

    private playDigitSound(digitChar: string): void {
        const digit = parseInt(digitChar, 10);
        if (isNaN(digit) || digit < 0 || digit > 9) {
            print("Gramophone plays: " + digitChar);
            return;
        }

        this.animateHintDigit(String(digit));

        const soundId = this.numberSoundIds[digit];
        if (!soundId || !soundId.trim()) {
            print("Gramophone plays: " + digit);
            return;
        }

        const vol = Math.min(1, Math.max(0, this.digitVolume));
        global.soundManager.playSpatialSound(this.getSceneObject(), soundId.trim(), vol, 1);
    }

    private ensureHintTextResolved(): void {
        if (this.hintTextResolved) return;
        this.hintTextResolved = true;
        if (!this.hintTextObject) return;
        this.hintTextTransform = this.hintTextObject.getTransform();
        this.hintText = this.findTextOnObject(this.hintTextObject);
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

    private prepareHintTextHidden(): void {
        if (!this.hintTextObject) return;
        this.ensureHintTextResolved();
        if (!this.hintTextTransform) return;
        this.stopHintTextAnim();
        this.hintTextObject.enabled = true;
        if (this.hintText) this.hintText.text = "";
        this.hintTextTransform.setLocalPosition(GramophoneRO.HINT_START_LOCAL);
        this.hintTextTransform.setLocalScale(new vec3(0, 0, 0));
        this.setHintTextAlpha(0);
    }

    private animateHintDigit(digitChar: string): void {
        if (!this.hintTextObject) return;
        this.ensureHintTextResolved();
        if (!this.hintTextTransform || !this.hintText) return;

        this.stopHintTextAnim();
        this.hintTextObject.enabled = true;
        this.hintText.text = digitChar;

        const tr = this.hintTextTransform;
        const startPos = GramophoneRO.HINT_START_LOCAL;
        const endPos = GramophoneRO.HINT_END_LOCAL;
        tr.setLocalPosition(startPos);
        tr.setLocalScale(new vec3(0, 0, 0));
        this.setHintTextAlpha(0);

        const fadeInEnd = GramophoneRO.HINT_FADE_IN_PORTION;
        const fadeOutStart = 1 - GramophoneRO.HINT_FADE_OUT_PORTION;
        const durationMs = Math.max(1, GramophoneRO.HINT_ANIM_SEC * 1000);

        this.hintTextTween = LSTween.rawTween(durationMs)
            .onUpdate((obj: { t: number }) => {
                const t = obj.t;
                tr.setLocalPosition(vec3.lerp(startPos, endPos, t));

                const scaleT = fadeInEnd > 0 ? t / fadeInEnd : t;
                tr.setLocalScale(new vec3(scaleT, scaleT, scaleT));

                let alpha = 1;
                if (t < fadeInEnd) {
                    alpha = fadeInEnd > 0 ? t / fadeInEnd : 1;
                } else if (t > fadeOutStart) {
                    const fadeSpan = 1 - fadeOutStart;
                    alpha = fadeSpan > 0 ? (1 - t) / fadeSpan : 0;
                }
                this.setHintTextAlpha(alpha);
            })
            .onComplete(() => {
                this.hintTextTween = null;
                tr.setLocalScale(new vec3(0, 0, 0));
                this.setHintTextAlpha(0);
            })
            .start();
    }

    private setHintTextAlpha(alpha: number): void {
        if (!this.hintText) return;
        const a = Math.max(0, Math.min(1, alpha));
        const fill = this.hintText.textFill.color;
        fill.a = a;
        this.hintText.textFill.color = fill;
        const shadow = this.hintText.dropshadowSettings.fill.color;
        shadow.a = a;
        this.hintText.dropshadowSettings.fill.color = shadow;
        const outline = this.hintText.outlineSettings.fill.color;
        outline.a = a;
        this.hintText.outlineSettings.fill.color = outline;
    }

    private stopHintTextAnim(): void {
        if (!this.hintTextTween) return;
        try {
            this.hintTextTween.stop();
        } catch (e) {}
        this.hintTextTween = null;
    }

    private teardown(): void {
        this.running = false;
        this.stopHintTextAnim();
        this.prepareHintTextHidden();
        global.utils.invalidateDelay(this.seqId);
        if (this.musicLoopSoundId) {
            global.soundManager.stopSpatialSound(this.getSceneObject(), this.musicLoopSoundId);
        }
        for (let i = 0; i < this.numberSoundIds.length; i++) {
            const id = (this.numberSoundIds[i] || "").trim();
            if (id) global.soundManager.stopSpatialSound(this.getSceneObject(), id);
        }
    }
}
