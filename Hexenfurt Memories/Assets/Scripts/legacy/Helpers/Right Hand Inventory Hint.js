const LSTween = require("LSTween.lspkg/Examples/Scripts/LSTween").LSTween;
const Easing = require("LSTween.lspkg/TweenJS/Easing").Easing;

//@input Component.RenderMeshVisual handRenderMeshVisual
//@input Asset.Material backlightMaterial
//@input SceneObject wristR {"label":"Wrist R"}
//@input SceneObject keyObject {"label":"Key"}

var handRenderMeshVisual = script.handRenderMeshVisual;
var backlightMaterial = script.backlightMaterial;
var hintChild = script.getSceneObject().getChild(0);
var parentT = script.getSceneObject().getTransform();
var wristRT = script.wristR.getTransform();
var keyT = script.keyObject.getTransform();
var deg = MathUtils.DegToRad;

script.createEvent("OnStartEvent").bind(function() {
    var newMaterial1 = handRenderMeshVisual.getMaterial(0).clone();
    var newMaterial2 = handRenderMeshVisual.getMaterial(1).clone();
    handRenderMeshVisual.clearMaterials();
    handRenderMeshVisual.addMaterial(newMaterial1);
    handRenderMeshVisual.addMaterial(newMaterial2);
    handRenderMeshVisual.getMaterial(0).mainPass.fadeLevel = 0.9;
});

function backlightTween(from, to, ms) {
    return LSTween.rawTween(ms)
        .easing(Easing.Sinusoidal.In)
        .onUpdate(function(obj) {
            backlightMaterial.mainPass.opacity = from + (to - from) * obj.t;
        });
}

global.inventoryHint = function() {
    hintChild.enabled = true;

    var move = LSTween.moveOffset(parentT, new vec3(-35, 0, 0), 600)
        .easing(Easing.Back.Out);

    var rotate = LSTween.rotateOffset(wristRT,
        quat.fromEulerAngles(0, 0, -150 * deg), 800)
        .easing(Easing.Back.Out);

    var keyShow = LSTween.scaleFromToLocal(keyT, vec3.zero(),
        new vec3(1.15, 1.15, 1.15), 250)
        .easing(Easing.Back.Out);

    var keySettle = LSTween.scaleFromToLocal(keyT,
        new vec3(1.15, 1.15, 1.15), vec3.one(), 150)
        .easing(Easing.Sinusoidal.Out);

    var backlightOn = backlightTween(0, 1, 250)
        .onComplete(function() {
            global.utils.delay(2, hideInventoryHint);
        });

    move.chain(rotate);
    rotate.chain(keyShow);
    keyShow.chain(keySettle);
    keySettle.chain(backlightOn);
    move.start();
};

function hideInventoryHint() {
    var backlightOff = backlightTween(1, 0, 180);

    var keyHide = LSTween.scaleFromToLocal(keyT, vec3.one(), vec3.zero(), 250)
        .easing(Easing.Back.In);

    var rotateOff = LSTween.rotateOffset(wristRT,
        quat.fromEulerAngles(0, 0, 150 * deg), 500)
        .easing(Easing.Cubic.In);

    var moveOff = LSTween.moveOffset(parentT, new vec3(45, 0, 0), 350)
        .easing(Easing.Back.In)
        .onComplete(function() {
            hintChild.enabled = false;
        });

    backlightOff.chain(keyHide);
    keyHide.chain(rotateOff);
    rotateOff.chain(moveOff);
    backlightOff.start();
}
