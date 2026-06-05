// Painting room object.

import { ItemSpot } from "./ItemSpot";
import { runTestItemSpots } from "./RoomObjectTesting";

@component
export class PaintingRO extends BaseScriptComponent {
    // @ui {"widget":"group_start", "label":"‎<font color='white'>Item Spots</font>"}
    @input
    @label("Spots")
    public itemSpots: ItemSpot[] = [];
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Visual</font>"}
    @input
    public paintingMaterial!: Material;

    @input
    public paintingTextures: Texture[] = [];
    // @ui {"widget":"group_end"}

    // @ui {"widget":"group_start", "label":"‎<font color='white'>Testing</font>"}
    @input
    public testItems: boolean = false;

    // @input int testSpot = 0 {"showIf":"testItems"}
    @input
    public testSpot: number = 0;

    // @input int testItem = 0 {"showIf":"testItems", "widget":"combobox", "values":[{"label":"Key", "value":0}, {"label":"Note", "value":1}, {"label":"Decoration", "value":2}]}
    @input
    public testItem: number = 0;

    // @input Asset.ObjectPrefab keyTestingPrefab {"showIf":"testItems"}
    @input
    @allowUndefined
    public keyTestingPrefab: ObjectPrefab | null = null;

    // @input Asset.ObjectPrefab noteTestingPrefab {"showIf":"testItems"}
    @input
    @allowUndefined
    public noteTestingPrefab: ObjectPrefab | null = null;

    // @input Asset.ObjectPrefab decoTestingPrefab {"showIf":"testItems"}
    @input
    @allowUndefined
    public decoTestingPrefab: ObjectPrefab | null = null;
    // @ui {"widget":"group_end"}

    onAwake(): void {
        this.createEvent("OnStartEvent").bind(() => {
            this.testItemSpots();
            this.paintingMaterial.mainPass.baseTex = this.paintingTextures[global.utils.rng(0, 4)];
        });
    }

    private testItemSpots(): void {
        runTestItemSpots(this);
    }
}
