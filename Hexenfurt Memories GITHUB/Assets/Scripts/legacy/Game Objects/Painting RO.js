//#region Inputs
/*
@typedef itemSpotClass
@property {string} objectType = "deco" {"widget":"combobox", "values":[{"label":"Decoration", "value":"deco"}, {"label":"Inventory Item", "value":"item"}, {"label":"Lore Item", "value":"lore"}, {"label":"Both", "value":"both"}]}
@property {int} orientation = 0 {"widget":"combobox", "values":[{"label":"Horizontal", "value":0}, {"label":"Vertical", "value":1}]}
@property {bool} lockedSlot = false
@property {SceneObject} origin
*/
// @input itemSpotClass[] itemSpots
// @input bool testItems = false;
// @input int testSpot = 0 {"showIf":"testItems"}
// @input int testItem = 0 {"showIf":"testItems", "widget":"combobox", "values":[{"label":"Key", "value":0}, {"label":"Note", "value":1}, {"label":"Decoration", "value":2}]}
// @input Asset.ObjectPrefab keyTestingPrefab {"showIf":"testItems"}
// @input Asset.ObjectPrefab noteTestingPrefab {"showIf":"testItems"}
// @input Asset.ObjectPrefab decoTestingPrefab {"showIf":"testItems"}
//#endregion

//@input Asset.Material paintingMaterial
/** @type {Material} */
var paintingMaterial = script.paintingMaterial;
//@input Asset.Texture[] paintingTextures
/** @type {Texture[]} */
var paintingTextures = script.paintingTextures;

script.roomObject = {
    itemSpots: script.itemSpots,
    getCodeClue: null,
}

function testItemSpots() {
    if(script.testItems) {
        var testingPrefab = script.testItem == 0 ? script.keyTestingPrefab : script.noteTestingPrefab;
        if(script.testItem == 2) {
            testingPrefab = script.decoTestingPrefab;
        }
        var spot = script.itemSpots[script.testSpot];
        var spawnedItem = testingPrefab.instantiate(spot.origin);
        spawnedItem.getTransform().setLocalPosition(vec3.zero());
        spawnedItem.getTransform().setLocalScale(new vec3(1,1,1));
    }
}

script.createEvent("OnStartEvent").bind(() => {
    testItemSpots();
    paintingMaterial.mainPass.baseTex = paintingTextures[global.utils.rng(0, 4)];
});