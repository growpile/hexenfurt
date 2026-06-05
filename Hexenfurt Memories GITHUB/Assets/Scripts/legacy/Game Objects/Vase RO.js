//#region Inputs
//@input Physics.BodyComponent vaseFullBody
/** @type {BodyComponent} */
var vaseFullBody = script.vaseFullBody;
//@input Physics.BodyComponent[] vaseParts
/** @type {BodyComponent[]} */
var vaseParts = script.vaseParts;
//@input Component.ScriptComponent chainController
/** @type {ScriptComponent} */
var chainController = script.chainController;
//@input Component.ScriptComponent vaseInteractable
/** @type {ScriptComponent} */
var vaseInteractable = script.vaseInteractable;
//@input Component.ScriptComponent vaseManipulation
/** @type {ScriptComponent} */
var vaseManipulation = script.vaseManipulation;
//@input Component.ScriptComponent vaseOutline
/** @type {ScriptComponent} */
var vaseOutline = script.vaseOutline;

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

script.roomObject = {
    itemSpots: script.itemSpots,
    getCodeClue: null,
}

script.interactedWith = false;
script.shattered = false;

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

vaseFullBody.onCollisionEnter.add(function (e) {
    var collision = e.collision;
    global.soundManager.playSpatialSound(script.getSceneObject(), "vaseImpact", 1, 1);

    if(collision.collider.getSceneObject().name == "Ground") {
        if(script.interactedWith) {
            global.soundManager.playSpatialSound(script.getSceneObject(), "vaseShatter", 1, 1);
            script.shatter();
        }
    }
});

script.shatter = function() {
    global.persistentStorage.increaseStat("vasesBroken");
    if(script.shattered) return;
    vaseInteractable.release();
    script.shattered = true;
    script.getSceneObject().getChild(0).getChild(0).getChild(0).enabled = true;
    script.getSceneObject().getChild(0).getChild(0).getChild(1).enabled = false;
    script.getSceneObject().getChild(0).getComponent("Physics.BodyComponent").enabled = false;
    makeDynamic();
}


function makeDynamic() {
    chainController.enabled = false;
    chainController.getSceneObject().getTransform().setWorldRotation(new quat(0,0,0,0));

    handleVaseMaterials();

    for(let p = 0; p < vaseParts.length; p++) {
        vaseParts[p].dynamic = true;
    }

    script.itemSpots[0].origin.enabled = true;
    var vasePos = script.getTransform().getWorldPosition();
    script.getTransform().setWorldPosition(new vec3(vasePos.x, global.groundHeight + 10, vasePos.z));

    global.utils.delay(3, function() {
        for(let p = 0; p < vaseParts.length; p++) {
            vaseParts[p].enabled = false;
        }
        vaseInteractable.enabled = false;
        vaseManipulation.enabled = false;
        vaseOutline.enabled = false;
        // chainController.enabled = false;
    })
}

function checkPositionAndReturn(vasePos) {
    if(vasePos.y < global.groundHeight) {
        vaseInteractable.enabled = false;
        vaseInteractable.enabled = true;
        vaseManipulation.enabled = false;
        vaseManipulation.enabled = true;
        vaseOutline.enabled = false;
        vaseOutline.enabled = true;
        vaseInteractable.onAwake();
        vaseOutline.init();
        script.getTransform().setWorldPosition(new vec3(vasePos.x, global.groundHeight + 10, vasePos.z));
    }
}

function handleVaseMaterials() {
    varFullBodyRmv = chainController.getSceneObject().getChild(1).getChild(0).getComponent('Component.RenderMeshVisual');
    for(let i = 0; i < vaseParts.length; i++) {
        var partRmv = vaseParts[i].getSceneObject().getComponent('Component.RenderMeshVisual');
        newMat = partRmv.getMaterial(0).clone();
        partRmv.clearMaterials();
        partRmv.addMaterial(newMat);
        newMat.mainPass.opacity = 0.7;
    }
}

script.createEvent("OnStartEvent").bind(() => {
    testItemSpots();

    vasePos = script.getTransform().getWorldPosition();
    script.getTransform().setWorldPosition(new vec3(vasePos.x, global.groundHeight + 1, vasePos.z));

    vaseInteractable.onTriggerStart.add(function () {
        if(script.shattered) return;
        chainController.enabled = true;
    })

    vaseInteractable.onTriggerEnd.add(function () {
        if(script.shattered) return;
        chainController.enabled = false;
        vasePos = script.getTransform().getWorldPosition();
        if(vasePos.y > global.groundHeight) {
            script.interactedWith = true;
            return;
        }

        checkPositionAndReturn(vasePos);
    })

    vaseInteractable.onTriggerUpdate.add(function () {
        if(script.shattered) return;
        vasePos = script.getTransform().getWorldPosition();
        checkPositionAndReturn(vasePos);
    })
})