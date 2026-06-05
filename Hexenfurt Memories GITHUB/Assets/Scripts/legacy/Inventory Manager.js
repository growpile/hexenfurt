const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

//#region Inputs

// @ui {"widget":"group_start", "label":"‎<font color='white'>Camera</font>"}
//@input Component.Camera camera {"label":"Camera"}
/** @type {Camera} */
var camera = script.camera;
//@input SceneObject cameraFloatingOrigin {"label":"Floating Origin"}
/** @type {SceneObject} */
var cameraFloatingOrigin = script.cameraFloatingOrigin;
//@input float inspectDistance = 60.0 {"label":"Inspect Distance"}
/** @type {number} */
var inspectDistance = script.inspectDistance;
// @ui {"widget":"group_end"}

// @ui {"widget":"group_start", "label":"‎<font color='white'>Inventory</font>"}
/*
@typedef inventoryObjectsClass
@property {SceneObject} visual
@property {string} itemId
*/
//@input inventoryObjectsClass[] inventoryObjects {"label":"Items"}
var inventoryObjects = script.inventoryObjects;
//@input Component.Text notebookTextComponent {"label":"Notebook Text"}
/** @type {Text} */
var notebookTextComponent = script.notebookTextComponent;
// @input SceneObject uiLayerObject {"label":"UI Layer Object"}
// @ui {"widget":"group_end"}

//#endregion

global.inventory = self;
global.inventory.items = {};
global.inventory.notes = [];
script.firstItem = true;
global.inventory.isInspecting = false;

const DEFAULT_NOTES = "Looks like I'll need a key to open the door. I'll look around. \n I will write down everything important in here. \n Findings: \n";

function applyLayerRecursive(sceneObject, layer) {
    sceneObject.layer = layer;
    var childCount = sceneObject.getChildrenCount();
    for (var i = 0; i < childCount; i++) {
        applyLayerRecursive(sceneObject.getChild(i), layer);
    }
}

function enableInventoryVisual(itemId) {
    for (var i = 0; i < inventoryObjects.length; i++) {
        if (inventoryObjects[i].itemId == itemId) {
            inventoryObjects[i].visual.enabled = true;
        }
    }
}

function disableAllInventoryVisuals() {
    for (var i = 0; i < inventoryObjects.length; i++) {
        inventoryObjects[i].visual.enabled = false;
    }
}

function reparentPreservingWorld(obj, newParent) {
    var t = obj.getTransform();
    var pos = t.getWorldPosition();
    var rot = t.getWorldRotation();
    obj.setParent(newParent);
    t.setWorldPosition(pos);
    t.setWorldRotation(rot);
}

function itemFaceCameraRot() {
    var standUp = quat.angleAxis(-Math.PI / 2, vec3.right());
    var faceCamera = quat.angleAxis(Math.PI / 2, vec3.up());
    return standUp.multiply(faceCamera);
}

function onFirstItem() {
    if (script.firstItem) {
        script.firstItem = false;
        global.inventoryHint();
        global.hintSystem.showHint("openInventoryHint");
    }
}

function animateInspectSequence(obj, transf, inspectTarget, facingRot, holdCallback, finishCallback, spinTransf, speed) {
    var st = spinTransf || transf;
    var s = speed || 1;
    var startPos = transf.getLocalPosition();
    var startRot = st.getLocalRotation();

    var approach = LSTween.moveFromToLocal(transf, startPos, inspectTarget, 800 / s).easing(Easing.Cubic.Out);
    var rotate = LSTween.rotateFromToLocal(st, startRot, facingRot, 800 / s).easing(Easing.Cubic.Out);

    approach.onComplete(function() {
        holdCallback();

        var fastSpin = null;
        if (spinTransf) {
            var halfTurn = quat.angleAxis(Math.PI, vec3.up());
            var slowSpin = LSTween.rotateOffset(st, halfTurn, 500 / s).easing(Easing.Sinusoidal.InOut);
            var medSpin = LSTween.rotateOffset(st, halfTurn, 350 / s).easing(Easing.Linear.None);
            fastSpin = LSTween.rotateOffset(st, halfTurn, 200 / s).easing(Easing.Linear.None)
                .repeat(Infinity);
            slowSpin.chain(medSpin);
            medSpin.chain(fastSpin);
            slowSpin.start();

            obj.createComponent("ScriptComponent").createEvent("OnDestroyEvent").bind(function() {
                if (fastSpin) { fastSpin.stop(); fastSpin = null; }
            });
        }

        global.utils.delay(1.0 / s, function() {
            var dropTarget = new vec3(0, -50, -60);
            var ZERO = vec3.zero();

            var drop = LSTween.moveFromToLocal(transf, inspectTarget, dropTarget, 500 / s).easing(Easing.Cubic.In);
            var shrink = LSTween.scaleFromToLocal(transf, transf.getLocalScale(), ZERO, 500 / s)
                .easing(Easing.Cubic.In)
                .onComplete(function() {
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

global.inventory.addItem = function(itemId, itemSceneObject) {
    print("Adding item: " + itemId);
    global.inventory.isInspecting = true;

    var transf = itemSceneObject.getTransform();
    var currentWorldPos = transf.getWorldPosition();
    var liftedPos = new vec3(currentWorldPos.x, currentWorldPos.y + 15, currentWorldPos.z);

    var lift = LSTween.moveFromToWorld(transf, currentWorldPos, liftedPos, 200).easing(Easing.Quadratic.Out);

    lift.onComplete(function() {
        reparentPreservingWorld(itemSceneObject, cameraFloatingOrigin);

        var facingRot = itemFaceCameraRot();
        var inspectTarget = new vec3(0, 0, -inspectDistance);

        var spinTransf = itemSceneObject.getChild(0).getTransform();

        animateInspectSequence(itemSceneObject, transf, inspectTarget, facingRot,
            function() {
                global.hintSystem.showHint("added_" + itemId);
                global.soundManager.playSound("takingKey", 1);
                global.persistentStorage.increaseStat("keysFound");
            },
            function() {
                global.inventory.isInspecting = false;
                itemSceneObject.enabled = false;
                enableInventoryVisual(itemId);
                global.inventory.items[itemId] = true;
                onFirstItem();
            },
            spinTransf,
            2
        );
    });

    lift.start();
};

global.inventory.addNote = function(noteText, itemSceneObject) {
    print("Adding note: " + noteText);
    global.inventory.isInspecting = true;
    itemSceneObject.layer = script.uiLayerObject.layer;
    applyLayerRecursive(itemSceneObject, script.uiLayerObject.layer);

    reparentPreservingWorld(itemSceneObject, cameraFloatingOrigin);

    var transf = itemSceneObject.getTransform();
    var noteFacingRot = quat.angleAxis(Math.PI / 2, vec3.right());
    var inspectTarget = new vec3(0, 0, -inspectDistance);

    animateInspectSequence(itemSceneObject, transf, inspectTarget, noteFacingRot,
        function() {
            global.hintSystem.showHint("addedNote");
            global.soundManager.playSound("takingNote", 1);
            global.persistentStorage.increaseStat("notesCollected");
        },
        function() {
            global.inventory.isInspecting = false;
            itemSceneObject.enabled = false;
            global.inventory.notes.push(noteText);
            notebookTextComponent.text = notebookTextComponent.text + " " + noteText + ", ";
            onFirstItem();
        }
    );
};

global.inventory.addLore = function(loreId, itemSceneObject, itemCenterSceneObject) {
    print("Adding lore: " + loreId);
    global.inventory.isInspecting = true;
    itemCenterSceneObject.layer = script.uiLayerObject.layer;
    applyLayerRecursive(itemCenterSceneObject, script.uiLayerObject.layer);

    reparentPreservingWorld(itemCenterSceneObject, cameraFloatingOrigin);

    var transf = itemCenterSceneObject.getTransform();
    var loreFacingRot = quat.angleAxis(Math.PI / 2, vec3.right());
    var inspectTarget = new vec3(0, 0, -inspectDistance);

    animateInspectSequence(itemCenterSceneObject, transf, inspectTarget, loreFacingRot,
        function() {
            global.soundManager.playSound("loreLearn", 1);
            if (global.persistentStorage.hasSeenLore(loreId)) {
                global.hintSystem.showHint("seenLore");
            } else {
                global.hintSystem.showHint("addedLore");
                global.newlyAcquiredLore = loreId;
                global.persistentStorage.addLoreSeen(loreId);
            }
        },
        function() {
            global.inventory.isInspecting = false;
            itemSceneObject.enabled = false;
            itemCenterSceneObject.enabled = false;
            itemSceneObject.destroy();
        }
    );
};

global.inventory.has = function(itemId) {
    return global.inventory.items.hasOwnProperty(itemId);
}

global.inventory.reset = function() {
    global.inventory.items = {};
    global.inventory.notes = [];
    global.inventory.isInspecting = false;
    disableAllInventoryVisuals();
    notebookTextComponent.text = DEFAULT_NOTES;
    print("Reset inventory!");
}

global.inventory.reset();
