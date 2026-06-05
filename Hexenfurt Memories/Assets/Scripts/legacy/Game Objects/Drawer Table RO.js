const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

//#region Inputs

// @ui {"widget":"group_start", "label":"‎<font color='white'>Drawer Setup</font>"}
//@input Component.ScriptComponent tableInteractable {"label":"Interactable"}
/** @type {ScriptComponent} */
var tableInteractable = script.tableInteractable;
//@input Component.ScriptComponent tableOutline {"label":"Outline"}
/** @type {ScriptComponent} */
var tableOutline = script.tableOutline;
//@input SceneObject tableDrawer {"label":"Drawer"}
/** @type {SceneObject} */
var tableDrawer = script.tableDrawer;
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Item Spots</font>"}
/*
@typedef itemSpotClass
@property {string} objectType = "deco" {"widget":"combobox", "values":[{"label":"Decoration", "value":"deco"}, {"label":"Inventory Item", "value":"item"}, {"label":"Lore Item", "value":"lore"}, {"label":"Both", "value":"both"}]}
@property {int} orientation = 0 {"widget":"combobox", "values":[{"label":"Horizontal", "value":0}, {"label":"Vertical", "value":1}]}
@property {bool} lockedSlot = false
@property {SceneObject} origin
*/
// @input itemSpotClass[] itemSpots {"label":"Spots"}
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Testing</font>"}
// @input bool testItems = false {"label":"Enable"}
// @input int testSpot = 0 {"showIf":"testItems", "label":"Spot Index"}
// @input int testItem = 0 {"showIf":"testItems", "label":"Item Type", "widget":"combobox", "values":[{"label":"Key", "value":0}, {"label":"Note", "value":1}, {"label":"Decoration", "value":2}]}
// @input Asset.ObjectPrefab keyTestingPrefab {"showIf":"testItems", "label":"Key Prefab"}
// @input Asset.ObjectPrefab noteTestingPrefab {"showIf":"testItems", "label":"Note Prefab"}
// @input Asset.ObjectPrefab decoTestingPrefab {"showIf":"testItems", "label":"Deco Prefab"}
// @ui {"widget":"group_end"}

//#endregion

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
        spawnedItem.getTransform().setLocalScale(vec3.one());
    }
}

var drawerTransform = tableDrawer.getTransform();
script.drawerOpened = false;

function openDrawer() {
    var startPos = drawerTransform.getLocalPosition();
    var slideTarget = new vec3(startPos.x, startPos.y, startPos.z + 10);
    var overshootTarget = new vec3(startPos.x, startPos.y, startPos.z + 10.8);

    var drawerSlide = LSTween.moveFromToLocal(drawerTransform, startPos, overshootTarget, 450)
        .easing(Easing.Cubic.Out);
    var drawerSettle = LSTween.moveFromToLocal(drawerTransform, overshootTarget, slideTarget, 200)
        .easing(Easing.Sinusoidal.InOut)
        .onComplete(function() { print("Drawer Table opened!"); });

    drawerSlide.chain(drawerSettle);
    drawerSlide.start();
}

script.createEvent("OnStartEvent").bind(() => {
    testItemSpots();

    tableInteractable.onTriggerEnd.add(function() {
        if(script.drawerOpened) return;
        script.drawerOpened = true;

        global.soundManager.playSpatialSound(script.getSceneObject(), "drawerOpen", 1, 1);
        tableInteractable.release();
        tableOutline.enabled = false;
        script.itemSpots[0].origin.enabled = true;
        openDrawer();
    })
})