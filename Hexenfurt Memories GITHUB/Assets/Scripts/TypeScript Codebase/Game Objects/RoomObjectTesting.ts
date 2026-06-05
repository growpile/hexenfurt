// Editor-testing helper shared by the room objects: fills their item spots with
// test content so a single object can be previewed without the full spawner.

import { ItemSpot } from "./ItemSpot";

export interface TestItemSpotConfig {
    testItems: boolean;
    testItem: number;
    testSpot: number;
    keyTestingPrefab: ObjectPrefab | null | undefined;
    noteTestingPrefab: ObjectPrefab | null | undefined;
    decoTestingPrefab: ObjectPrefab | null | undefined;
    itemSpots: ItemSpot[];
}

/** Spawns the selected testing prefab (key / note / decoration) into the chosen
 *  item spot when `testItems` is enabled in the inspector. No-op otherwise. */
export function runTestItemSpots(cfg: TestItemSpotConfig): void {
    if (!cfg.testItems) return;
    let testingPrefab = cfg.testItem === 0 ? cfg.keyTestingPrefab : cfg.noteTestingPrefab;
    if (cfg.testItem === 2) testingPrefab = cfg.decoTestingPrefab;
    if (!testingPrefab) return;
    const spot = cfg.itemSpots[cfg.testSpot];
    if (!spot) return;
    const spawnedItem = testingPrefab.instantiate(spot.origin);
    spawnedItem.getTransform().setLocalPosition(vec3.zero());
    spawnedItem.getTransform().setLocalScale(new vec3(1, 1, 1));
}
