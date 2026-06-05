// Inventory of collected clues and keys. Exposed as global.inventory.

const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

@typedef
export class InventoryEntry {
    @input
    visual!: SceneObject;

    @input
    @label("Item ID")
    itemId: string = "";
}

const DEFAULT_NOTES =
    "Looks like I'll need a key to open the door. I'll look around. \n I will write down everything important in here. \n Findings: \n";

@component
export class InventoryManager extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Camera</font>"}
    @input
    public camera!: Camera;

    @input
    public cameraFloatingOrigin!: SceneObject;

    @input
    public inspectDistance: number = 60.0;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Inventory</font>"}
    @input
    @label("Items")
    public inventoryObjects: InventoryEntry[] = [];

    @input
    public notebookTextComponent!: Text;

    @input
    public uiLayerObject!: SceneObject;
    // @ui {"widget":"group_end"}

    private firstItem: boolean = true;
    private items: { [key: string]: boolean } = {};
    private notes: string[] = [];
    private isInspecting: boolean = false;

    onAwake(): void {
        const self = this;
        const api: HexenfurtInventory = {
            get items() { return self.items; },
            get notes() { return self.notes; },
            get isInspecting() { return self.isInspecting; },
            set isInspecting(v: boolean) { self.isInspecting = v; },
            addItem: (id, so) => this.addItem(id, so),
            addNote: (text, so) => this.addNote(text, so),
            addLore: (id, so, center) => this.addLore(id, so, center),
            has: (id) => this.has(id),
            reset: () => this.reset(),
        };
        global.inventory = api;
        this.reset();
    }

    private applyLayerRecursive(sceneObject: SceneObject, layer: LayerSet): void {
        sceneObject.layer = layer;
        const count = sceneObject.getChildrenCount();
        for (let i = 0; i < count; i++) {
            this.applyLayerRecursive(sceneObject.getChild(i), layer);
        }
    }

    private enableInventoryVisual(itemId: string): void {
        for (let i = 0; i < this.inventoryObjects.length; i++) {
            if (this.inventoryObjects[i].itemId === itemId) {
                this.inventoryObjects[i].visual.enabled = true;
            }
        }
    }

    private disableAllInventoryVisuals(): void {
        for (let i = 0; i < this.inventoryObjects.length; i++) {
            this.inventoryObjects[i].visual.enabled = false;
        }
    }

    private reparentPreservingWorld(obj: SceneObject, newParent: SceneObject): void {
        const t = obj.getTransform();
        const pos = t.getWorldPosition();
        const rot = t.getWorldRotation();
        obj.setParent(newParent);
        t.setWorldPosition(pos);
        t.setWorldRotation(rot);
    }

    private itemFaceCameraRot(): quat {
        const standUp = quat.angleAxis(-Math.PI / 2, vec3.right());
        const faceCamera = quat.angleAxis(Math.PI / 2, vec3.up());
        return standUp.multiply(faceCamera);
    }

    private onFirstItem(): void {
        if (this.firstItem) {
            this.firstItem = false;
            (global as any).inventoryHint?.();
            global.hintSystem.showHint("openInventoryHint");
        }
    }

    private animateInspectSequence(
        obj: SceneObject,
        transf: Transform,
        inspectTarget: vec3,
        facingRot: quat,
        holdCallback: () => void,
        finishCallback: () => void,
        spinTransf?: Transform | null,
        speed?: number,
    ): void {
        const st = spinTransf || transf;
        const s = speed || 1;
        const startPos = transf.getLocalPosition();
        const startRot = st.getLocalRotation();

        const approach = LSTween.moveFromToLocal(transf, startPos, inspectTarget, 800 / s).easing(Easing.Cubic.Out);
        const rotate = LSTween.rotateFromToLocal(st, startRot, facingRot, 800 / s).easing(Easing.Cubic.Out);

        approach.onComplete(() => {
            holdCallback();

            let fastSpin: any = null;
            if (spinTransf) {
                const halfTurn = quat.angleAxis(Math.PI, vec3.up());
                const slowSpin = LSTween.rotateOffset(st, halfTurn, 500 / s).easing(Easing.Sinusoidal.InOut);
                const medSpin = LSTween.rotateOffset(st, halfTurn, 350 / s).easing(Easing.Linear.None);
                fastSpin = LSTween.rotateOffset(st, halfTurn, 200 / s).easing(Easing.Linear.None).repeat(Infinity);
                slowSpin.chain(medSpin);
                medSpin.chain(fastSpin);
                slowSpin.start();

                obj.createComponent("ScriptComponent").createEvent("OnDestroyEvent").bind(() => {
                    if (fastSpin) { fastSpin.stop(); fastSpin = null; }
                });
            }

            global.utils.delay(1.0 / s, () => {
                const dropTarget = new vec3(0, -50, -60);
                const ZERO = vec3.zero();

                const drop = LSTween.moveFromToLocal(transf, inspectTarget, dropTarget, 500 / s).easing(Easing.Cubic.In);
                const shrink = LSTween.scaleFromToLocal(transf, transf.getLocalScale(), ZERO, 500 / s)
                    .easing(Easing.Cubic.In)
                    .onComplete(() => {
                        if (fastSpin) fastSpin.stop();
                        finishCallback();
                    });
                drop.start();
                shrink.start();
            });
        });

        approach.start();
        rotate.start();
    }

    public addItem(itemId: string, itemSceneObject: SceneObject): void {
        print("Adding item: " + itemId);
        this.isInspecting = true;

        const transf = itemSceneObject.getTransform();
        const currentWorldPos = transf.getWorldPosition();
        const liftedPos = new vec3(currentWorldPos.x, currentWorldPos.y + 15, currentWorldPos.z);

        const lift = LSTween.moveFromToWorld(transf, currentWorldPos, liftedPos, 200).easing(Easing.Quadratic.Out);

        lift.onComplete(() => {
            this.reparentPreservingWorld(itemSceneObject, this.cameraFloatingOrigin);

            const facingRot = this.itemFaceCameraRot();
            const inspectTarget = new vec3(0, 0, -this.inspectDistance);

            const spinTransf = itemSceneObject.getChild(0).getTransform();

            this.animateInspectSequence(itemSceneObject, transf, inspectTarget, facingRot,
                () => {
                    global.hintSystem.showHint("added_" + itemId);
                    global.soundManager.playSound("takingKey", 1);
                    global.persistentStorage.increaseStat("keysFound");
                },
                () => {
                    this.isInspecting = false;
                    itemSceneObject.enabled = false;
                    this.enableInventoryVisual(itemId);
                    this.items[itemId] = true;
                    this.onFirstItem();
                },
                spinTransf,
                2,
            );
        });

        lift.start();
    }

    public addNote(noteText: string, itemSceneObject: SceneObject): void {
        print("Adding note: " + noteText);
        this.isInspecting = true;
        itemSceneObject.layer = this.uiLayerObject.layer;
        this.applyLayerRecursive(itemSceneObject, this.uiLayerObject.layer);

        this.reparentPreservingWorld(itemSceneObject, this.cameraFloatingOrigin);

        const transf = itemSceneObject.getTransform();
        const noteFacingRot = quat.angleAxis(Math.PI / 2, vec3.right());
        const inspectTarget = new vec3(0, 0, -this.inspectDistance);

        this.animateInspectSequence(itemSceneObject, transf, inspectTarget, noteFacingRot,
            () => {
                global.hintSystem.showHint("addedNote");
                global.soundManager.playSound("takingNote", 1);
                global.persistentStorage.increaseStat("notesCollected");
            },
            () => {
                this.isInspecting = false;
                itemSceneObject.enabled = false;
                this.notes.push(noteText);
                this.notebookTextComponent.text = this.notebookTextComponent.text + " " + noteText + ", ";
                this.onFirstItem();
            }
        );
    }

    public addLore(loreId: string, itemSceneObject: SceneObject, itemCenterSceneObject: SceneObject): void {
        print("Adding lore: " + loreId);
        this.isInspecting = true;
        itemCenterSceneObject.layer = this.uiLayerObject.layer;
        this.applyLayerRecursive(itemCenterSceneObject, this.uiLayerObject.layer);

        this.reparentPreservingWorld(itemCenterSceneObject, this.cameraFloatingOrigin);

        const transf = itemCenterSceneObject.getTransform();
        const loreFacingRot = quat.angleAxis(Math.PI / 2, vec3.right());
        const inspectTarget = new vec3(0, 0, -this.inspectDistance);

        this.animateInspectSequence(itemCenterSceneObject, transf, inspectTarget, loreFacingRot,
            () => {
                global.soundManager.playSound("loreLearn", 1);
                if (global.persistentStorage.hasSeenLore(loreId)) {
                    global.hintSystem.showHint("seenLore");
                } else {
                    global.hintSystem.showHint("addedLore");
                    global.newlyAcquiredLore = loreId;
                    global.persistentStorage.addLoreSeen(loreId);
                }
            },
            () => {
                this.isInspecting = false;
                itemSceneObject.enabled = false;
                itemCenterSceneObject.enabled = false;
                itemSceneObject.destroy();
            }
        );
    }

    public has(itemId: string): boolean {
        return Object.prototype.hasOwnProperty.call(this.items, itemId);
    }

    public reset(): void {
        this.items = {};
        this.notes = [];
        this.isInspecting = false;
        this.disableAllInventoryVisuals();
        if (this.notebookTextComponent) {
            this.notebookTextComponent.text = DEFAULT_NOTES;
        }
        print("Reset inventory!");
    }
}
