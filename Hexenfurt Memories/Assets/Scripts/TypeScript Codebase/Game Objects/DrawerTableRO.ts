// Drawer table room object. The drawer is unlocked and opens directly on trigger.

import { ItemSpot } from "./ItemSpot";
import { runTestItemSpots } from "./RoomObjectTesting";

const LSTween_DT = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing_DT = require("LSTween.lspkg/TweenJS/Easing").Easing;

@component
export class DrawerTableRO extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Drawer Setup</font>"}
    @input
    public tableInteractable!: ScriptComponent;

    @input
    public tableOutline!: ScriptComponent;

    @input
    public tableDrawer!: SceneObject;
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

    public drawerOpened: boolean = false;
    /** No clue source; matches the JS `getCodeClue: null`. */
    public init: null = null;

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            this.testItemSpots();
            (this.tableInteractable as any).onTriggerEnd.add(() => {
                if (this.drawerOpened) return;
                this.drawerOpened = true;

                global.soundManager.playSpatialSound(this.getSceneObject(), "drawerOpen", 1, 1);
                (this.tableInteractable as any).release();
                this.tableOutline.enabled = false;
                if (this.itemSpots[0]) this.itemSpots[0].origin.enabled = true;
                this.openDrawer();
            });
        });
    }

    private openDrawer(): void {
        const drawerTransform = this.tableDrawer.getTransform();
        const startPos = drawerTransform.getLocalPosition();
        const slideTarget = new vec3(startPos.x, startPos.y, startPos.z + 10);
        const overshootTarget = new vec3(startPos.x, startPos.y, startPos.z + 10.8);

        const drawerSlide = LSTween_DT.moveFromToLocal(drawerTransform, startPos, overshootTarget, 450).easing(Easing_DT.Cubic.Out);
        const drawerSettle = LSTween_DT.moveFromToLocal(drawerTransform, overshootTarget, slideTarget, 200)
            .easing(Easing_DT.Sinusoidal.InOut)
            .onComplete(() => { print("Drawer Table opened!"); });

        drawerSlide.chain(drawerSettle);
        drawerSlide.start();
    }

    private testItemSpots(): void {
        runTestItemSpots(this);
    }
}
