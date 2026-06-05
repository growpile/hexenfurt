// Vase room object. Publishes its item spots and shatters on ground impact
// (shatter() is invoked by the collision handler).

import { ItemSpot } from "./ItemSpot";
import { fadeMaterialsAndDestroy } from "./PhysicsDebrisFade";
import { runTestItemSpots } from "./RoomObjectTesting";

@component
export class VaseRO extends BaseScriptComponent {
    private static readonly SHARD_SETTLE_SEC = 3;
    /** World Y offset used when snapping a vase back above the floor. */
    private static readonly ABOVE_GROUND_MARGIN = 10;

    private vaseFadeMaterials: Material[] = [];
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Vase Bodies</font>"}
    @input
    public vaseFullBody!: BodyComponent;

    @input
    public vaseParts: BodyComponent[] = [];
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Interaction</font>"}
    @input
    public chainController!: ScriptComponent;

    @input
    public vaseInteractable!: ScriptComponent;

    @input
    public vaseManipulation!: ScriptComponent;

    @input
    public vaseOutline!: ScriptComponent;
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Item Spots</font>"}
    @input
    @label("Spots")
    public itemSpots: ItemSpot[] = [];
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Testing</font>"}
    @input
    public testItems: boolean = false;

    @input
    public testSpot: number = 0;

    // @input int testItem = 0 {"showIf":"testItems", "widget":"combobox", "values":[{"label":"Key", "value":0}, {"label":"Note", "value":1}, {"label":"Decoration", "value":2}]}
    @input
    public testItem: number = 0;

    @input
    @allowUndefined
    public keyTestingPrefab: ObjectPrefab | null = null;

    @input
    @allowUndefined
    public noteTestingPrefab: ObjectPrefab | null = null;

    @input
    @allowUndefined
    public decoTestingPrefab: ObjectPrefab | null = null;
    // @ui {"widget":"group_end"}

    public interactedWith: boolean = false;
    public shattered: boolean = false;

    onAwake(): void {
        this.vaseFullBody.onCollisionEnter.add((e: any) => {
            const collision = e.collision;
            global.soundManager.playSpatialSound(this.getSceneObject(), "vaseImpact", 1, 1);
            if (collision.collider.getSceneObject().name === "Ground") {
                if (this.interactedWith) {
                    global.soundManager.playSpatialSound(this.getSceneObject(), "vaseShatter", 1, 1);
                    this.shatter();
                }
            }
        });

        this.createEvent("OnStartEvent").bind(() => {
            this.testItemSpots();

            this.snapVaseAboveGround(VaseRO.ABOVE_GROUND_MARGIN - 9);

            (this.vaseInteractable as any).onTriggerStart.add(() => {
                if (this.shattered) return;
                this.chainController.enabled = true;
            });

            (this.vaseInteractable as any).onTriggerEnd.add(() => {
                if (this.shattered) return;
                this.chainController.enabled = false;
                this.handleRelease();
            });
        });
    }

    public shatter = (): void => {
        if (this.shattered) return;
        global.persistentStorage.increaseStat("vasesBroken");
        (this.vaseInteractable as any).release();
        this.shattered = true;
        this.getSceneObject().getChild(0).getChild(0).getChild(0).enabled = true;
        this.getSceneObject().getChild(0).getChild(0).getChild(1).enabled = false;
        this.getSceneObject().getChild(0).getComponent("Physics.BodyComponent").enabled = false;
        this.makeDynamic();
    };

    private makeDynamic(): void {
        this.chainController.enabled = false;
        this.chainController.getSceneObject().getTransform().setWorldRotation(new quat(0, 0, 0, 0));

        this.handleVaseMaterials();

        for (let p = 0; p < this.vaseParts.length; p++) this.vaseParts[p].dynamic = true;

        if (this.itemSpots[0]) this.itemSpots[0].origin.enabled = true;
        this.snapVaseAboveGround(VaseRO.ABOVE_GROUND_MARGIN);

        global.utils.delay(VaseRO.SHARD_SETTLE_SEC, () => {
            const shardRoots: SceneObject[] = [];
            for (let p = 0; p < this.vaseParts.length; p++) {
                this.vaseParts[p].dynamic = false;
                this.vaseParts[p].enabled = false;
                shardRoots.push(this.vaseParts[p].getSceneObject());
            }
            this.vaseInteractable.enabled = false;
            this.vaseManipulation.enabled = false;
            this.vaseOutline.enabled = false;
            fadeMaterialsAndDestroy(this, this.vaseFadeMaterials, shardRoots);
        });
    }

    /** On release: above floor → can shatter on ground hit; below floor → snap only. */
    private handleRelease(): void {
        const p = this.getTrackedWorldPosition();
        if (p.y < global.groundHeight) {
            this.resetInteractionComponents();
            this.snapVaseAboveGround(VaseRO.ABOVE_GROUND_MARGIN);
            return;
        }
        this.interactedWith = true;
    }

    /** Interactable root moves during drag; VaseRO root often stays at the spawn point. */
    private getTrackedWorldPosition(): vec3 {
        const interactablePos = this.vaseInteractable.getSceneObject().getTransform().getWorldPosition();
        if (!this.chainController || !this.chainController.enabled) {
            return interactablePos;
        }
        const chainPos = this.chainController.getSceneObject().getTransform().getWorldPosition();
        return chainPos.y < interactablePos.y ? chainPos : interactablePos;
    }

    private snapVaseAboveGround(marginAboveGround: number): void {
        const tracked = this.getTrackedWorldPosition();
        const targetY = global.groundHeight + marginAboveGround;
        if (tracked.y >= global.groundHeight) return;

        const root = this.getSceneObject().getTransform();
        const rootPos = root.getWorldPosition();
        const deltaY = targetY - tracked.y;
        root.setWorldPosition(new vec3(rootPos.x, rootPos.y + deltaY, rootPos.z));
    }

    private resetInteractionComponents(): void {
        this.vaseInteractable.enabled = false;
        this.vaseInteractable.enabled = true;
        this.vaseManipulation.enabled = false;
        this.vaseManipulation.enabled = true;
        this.vaseOutline.enabled = false;
        this.vaseOutline.enabled = true;
        (this.vaseInteractable as any).onAwake();
        (this.vaseOutline as any).init();
    }

    private handleVaseMaterials(): void {
        this.vaseFadeMaterials = [];
        for (let i = 0; i < this.vaseParts.length; i++) {
            const partRmv = this.vaseParts[i].getSceneObject().getComponent("Component.RenderMeshVisual");
            const newMat = partRmv.getMaterial(0).clone();
            partRmv.clearMaterials();
            partRmv.addMaterial(newMat);
            (newMat.mainPass as any).opacity = 1;
            this.vaseFadeMaterials.push(newMat);
        }
    }

    private testItemSpots(): void {
        runTestItemSpots(this);
    }
}
